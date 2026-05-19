import os
import uuid
import json
import re
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, verify_jwt_in_request
)
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from PIL import Image

# ── App setup ──────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, '..', 'uploads')
THUMB_DIR  = os.path.join(BASE_DIR, '..', 'thumbnails')
DB_PATH    = os.path.join(BASE_DIR, '..', 'data.db')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMB_DIR,  exist_ok=True)

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, '..', 'frontend'))
app.config['SQLALCHEMY_DATABASE_URI']        = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY']                 = 'super-secret-jwt-key-change-in-prod'
app.config['JWT_ACCESS_TOKEN_EXPIRES']       = 3600          # 1 h
app.config['JWT_REFRESH_TOKEN_EXPIRES']      = 86400 * 30    # 30 d
app.config['MAX_CONTENT_LENGTH']             = 4 * 1024 * 1024 * 1024  # 4 GB

CORS(app, origins='*', supports_credentials=True)
db  = SQLAlchemy(app)
jwt = JWTManager(app)

ALLOWED_VIDEO = {'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'}
ALLOWED_IMG   = {'jpg', 'jpeg', 'png', 'gif', 'webp'}

# ── Models ─────────────────────────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = 'users'
    id         = db.Column(db.Integer, primary_key=True)
    email      = db.Column(db.String(120), unique=True, nullable=False)
    username   = db.Column(db.String(50),  unique=True, nullable=False)
    password   = db.Column(db.String(256), nullable=False)
    avatar     = db.Column(db.String(256), default=None)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    videos      = db.relationship('Video',   backref='author',  lazy=True, foreign_keys='Video.user_id')
    comments    = db.relationship('Comment', backref='author',  lazy=True, foreign_keys='Comment.user_id')
    likes       = db.relationship('Like',    backref='user',    lazy=True, foreign_keys='Like.user_id')
    subs_from   = db.relationship('Subscription', foreign_keys='Subscription.subscriber_id',
                                  backref='subscriber', lazy=True)
    subs_to     = db.relationship('Subscription', foreign_keys='Subscription.channel_id',
                                  backref='channel', lazy=True)

    def to_dict(self, current_user_id=None):
        sub_count = Subscription.query.filter_by(channel_id=self.id).count()
        subscribed = False
        if current_user_id:
            subscribed = bool(Subscription.query.filter_by(
                subscriber_id=current_user_id, channel_id=self.id).first())
        return {
            'id': self.id, 'email': self.email, 'username': self.username,
            'avatar': f'/api/avatars/{self.avatar}' if self.avatar else None,
            'subscribers': sub_count, 'subscribed': subscribed,
            'created_at': self.created_at.isoformat()
        }


class Video(db.Model):
    __tablename__ = 'videos'
    id          = db.Column(db.Integer, primary_key=True)
    uuid        = db.Column(db.String(36), unique=True, default=lambda: str(uuid.uuid4()))
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    filename    = db.Column(db.String(256), nullable=False)
    thumbnail   = db.Column(db.String(256), default=None)
    duration    = db.Column(db.Integer, default=0)   # seconds
    views       = db.Column(db.Integer, default=0)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    comments    = db.relationship('Comment', backref='video', lazy=True,
                                  cascade='all, delete-orphan')
    likes       = db.relationship('Like',    backref='video', lazy=True,
                                  cascade='all, delete-orphan')

    def to_dict(self, current_user_id=None):
        like_count    = Like.query.filter_by(video_id=self.id, is_like=True).count()
        dislike_count = Like.query.filter_by(video_id=self.id, is_like=False).count()
        user_reaction = None
        if current_user_id:
            r = Like.query.filter_by(video_id=self.id, user_id=current_user_id).first()
            if r:
                user_reaction = 'like' if r.is_like else 'dislike'
        return {
            'id': self.id, 'uuid': self.uuid, 'title': self.title,
            'description': self.description,
            'thumbnail': f'/api/thumbnails/{self.thumbnail}' if self.thumbnail else None,
            'duration': self.duration, 'views': self.views,
            'likes': like_count, 'dislikes': dislike_count,
            'user_reaction': user_reaction,
            'author': self.author.to_dict(current_user_id),
            'created_at': self.created_at.isoformat(),
            'stream_url': f'/api/stream/{self.uuid}'
        }

    def time_ago(self):
        now   = datetime.now(timezone.utc)
        delta = now - self.created_at.replace(tzinfo=timezone.utc)
        s = delta.total_seconds()
        if s < 3600:       return f'{int(s//60)} мин. назад'
        if s < 86400:      return f'{int(s//3600)} ч. назад'
        if s < 2592000:    return f'{int(s//86400)} дн. назад'
        if s < 31536000:   return f'{int(s//2592000)} мес. назад'
        return f'{int(s//31536000)} лет назад'


class Comment(db.Model):
    __tablename__ = 'comments'
    id         = db.Column(db.Integer, primary_key=True)
    text       = db.Column(db.Text, nullable=False)
    video_id   = db.Column(db.Integer, db.ForeignKey('videos.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        # Явно загружаем пользователя по user_id чтобы избежать путаницы backref
        user = User.query.get(self.user_id)
        return {
            'id': self.id, 'text': self.text,
            'author': {'id': user.id, 'username': user.username,
                       'avatar': f'/api/avatars/{user.avatar}' if user.avatar else None},
            'created_at': self.created_at.isoformat()
        }


class Like(db.Model):
    __tablename__ = 'likes'
    id       = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.Integer, db.ForeignKey('videos.id'), nullable=False)
    user_id  = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    is_like  = db.Column(db.Boolean, nullable=False)
    __table_args__ = (db.UniqueConstraint('video_id', 'user_id'),)


class Subscription(db.Model):
    __tablename__  = 'subscriptions'
    id            = db.Column(db.Integer, primary_key=True)
    subscriber_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    channel_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    __table_args__ = (db.UniqueConstraint('subscriber_id', 'channel_id'),)


# ── Helpers ────────────────────────────────────────────────────────────────────
def allowed_video(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO

def allowed_img(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMG

def fmt_views(n):
    if n >= 1_000_000: return f'{n/1_000_000:.1f} млн.'
    if n >= 1_000:     return f'{n/1_000:.0f} тыс.'
    return str(n)

def optional_user_id():
    try:
        verify_jwt_in_request(optional=True)
        return get_jwt_identity()
    except Exception:
        return None


# ── Auth routes ────────────────────────────────────────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email    = (data.get('email')    or '').strip().lower()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')
    confirm  = (data.get('confirm_password') or '')

    errors = {}
    if not email:
        errors['email'] = 'Email обязателен'
    elif not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        errors['email'] = 'Некорректный email'
    elif User.query.filter_by(email=email).first():
        errors['email'] = 'Email уже занят'

    if not username:
        errors['username'] = 'Имя пользователя обязательно'
    elif len(username) < 3:
        errors['username'] = 'Минимум 3 символа'
    elif len(username) > 50:
        errors['username'] = 'Максимум 50 символов'
    elif not re.match(r'^[A-Za-z0-9_а-яёА-ЯЁ]+$', username):
        errors['username'] = 'Только буквы, цифры и _'
    elif User.query.filter_by(username=username).first():
        errors['username'] = 'Имя уже занято'

    if not password:
        errors['password'] = 'Пароль обязателен'
    elif len(password) < 6:
        errors['password'] = 'Минимум 6 символов'

    if password and confirm != password:
        errors['confirm_password'] = 'Пароли не совпадают'

    if errors:
        return jsonify({'errors': errors}), 422

    user = User(email=email, username=username,
                password=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()

    access  = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({'access_token': access, 'refresh_token': refresh,
                    'user': user.to_dict()}), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    login_val = (data.get('email') or data.get('login') or '').strip().lower()
    password  = data.get('password') or ''

    if not login_val or not password:
        return jsonify({'error': 'Укажите email/логин и пароль'}), 400

    user = User.query.filter(
        (User.email == login_val) | (User.username == login_val)
    ).first()

    if not user or not check_password_hash(user.password, password):
        return jsonify({'error': 'Неверный логин или пароль'}), 401

    access  = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({'access_token': access, 'refresh_token': refresh,
                    'user': user.to_dict()})


@app.route('/api/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh_token():
    uid    = get_jwt_identity()
    access = create_access_token(identity=uid)
    return jsonify({'access_token': access})


@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def me():
    uid  = int(get_jwt_identity())
    user = User.query.get_or_404(uid)
    return jsonify(user.to_dict(uid))


# ── Video routes ───────────────────────────────────────────────────────────────
@app.route('/api/videos', methods=['GET'])
def get_videos():
    uid   = optional_user_id()
    q     = request.args.get('q', '').strip()
    page  = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 12))

    query = Video.query
    if q:
        query = query.filter(Video.title.ilike(f'%{q}%'))
    query  = query.order_by(Video.created_at.desc())
    total  = query.count()
    videos = query.offset((page - 1) * limit).limit(limit).all()

    result = []
    for v in videos:
        d = v.to_dict(int(uid) if uid else None)
        d['views_fmt']   = fmt_views(v.views)
        d['time_ago']    = v.time_ago()
        result.append(d)

    return jsonify({'videos': result, 'total': total, 'page': page, 'limit': limit})


@app.route('/api/videos/<video_uuid>', methods=['GET'])
def get_video(video_uuid):
    uid   = optional_user_id()
    video = Video.query.filter_by(uuid=video_uuid).first_or_404()
    video.views += 1
    db.session.commit()
    d = video.to_dict(int(uid) if uid else None)
    d['views_fmt'] = fmt_views(video.views)
    d['time_ago']  = video.time_ago()
    return jsonify(d)


@app.route('/api/videos/upload', methods=['POST'])
@jwt_required()
def upload_video():
    uid = int(get_jwt_identity())
    if 'video' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400

    file  = request.files['video']
    title = (request.form.get('title') or '').strip()
    desc  = (request.form.get('description') or '').strip()

    if not title:
        return jsonify({'error': 'Укажите название'}), 422
    if len(title) > 200:
        return jsonify({'error': 'Название слишком длинное (макс. 200)'}), 422
    if not allowed_video(file.filename):
        return jsonify({'error': 'Недопустимый формат видео'}), 422

    ext      = file.filename.rsplit('.', 1)[1].lower()
    fname    = f'{uuid.uuid4()}.{ext}'
    fpath    = os.path.join(UPLOAD_DIR, fname)
    file.save(fpath)

    # thumbnail
    thumb_name = None
    thumb_file = request.files.get('thumbnail')
    if thumb_file and allowed_img(thumb_file.filename):
        ext2       = thumb_file.filename.rsplit('.', 1)[1].lower()
        thumb_name = f'{uuid.uuid4()}.{ext2}'
        tpath      = os.path.join(THUMB_DIR, thumb_name)
        img = Image.open(thumb_file)
        img.thumbnail((640, 360))
        img.save(tpath)

    video = Video(title=title, description=desc,
                  filename=fname, thumbnail=thumb_name, user_id=uid)
    db.session.add(video)
    db.session.commit()
    return jsonify(video.to_dict(uid)), 201


@app.route('/api/videos/<video_uuid>', methods=['DELETE'])
@jwt_required()
def delete_video(video_uuid):
    uid   = int(get_jwt_identity())
    video = Video.query.filter_by(uuid=video_uuid).first_or_404()
    if video.user_id != uid:
        return jsonify({'error': 'Нет доступа'}), 403
    # delete files
    try:
        os.remove(os.path.join(UPLOAD_DIR, video.filename))
    except Exception:
        pass
    if video.thumbnail:
        try:
            os.remove(os.path.join(THUMB_DIR, video.thumbnail))
        except Exception:
            pass
    db.session.delete(video)
    db.session.commit()
    return jsonify({'ok': True})


# ── Streaming ──────────────────────────────────────────────────────────────────
@app.route('/api/stream/<video_uuid>')
def stream_video(video_uuid):
    video   = Video.query.filter_by(uuid=video_uuid).first_or_404()
    path    = os.path.join(UPLOAD_DIR, video.filename)
    size    = os.path.getsize(path)
    range_h = request.headers.get('Range')

    ext  = video.filename.rsplit('.', 1)[1].lower()
    mime = {'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
            'mov': 'video/mp4', 'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska'}.get(ext, 'video/mp4')

    CHUNK = 1024 * 1024  # 1 MB

    if range_h:
        parts = range_h.replace('bytes=', '').split('-')
        start = int(parts[0])
        end   = int(parts[1]) if parts[1] else size - 1
        end   = min(end, size - 1)
        length = end - start + 1

        def generate():
            with open(path, 'rb') as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    data = f.read(min(CHUNK, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        resp = Response(stream_with_context(generate()), 206, mimetype=mime,
                        content_type=mime, direct_passthrough=True)
        resp.headers['Content-Range']  = f'bytes {start}-{end}/{size}'
        resp.headers['Accept-Ranges']  = 'bytes'
        resp.headers['Content-Length'] = str(length)
    else:
        def generate_full():
            with open(path, 'rb') as f:
                while True:
                    data = f.read(CHUNK)
                    if not data:
                        break
                    yield data

        resp = Response(stream_with_context(generate_full()), 200, mimetype=mime,
                        content_type=mime, direct_passthrough=True)
        resp.headers['Content-Length'] = str(size)
        resp.headers['Accept-Ranges']  = 'bytes'

    resp.headers['Cache-Control'] = 'no-cache'
    return resp


# ── Thumbnails / Avatars ───────────────────────────────────────────────────────
@app.route('/api/thumbnails/<filename>')
def serve_thumbnail(filename):
    return send_from_directory(THUMB_DIR, filename)

@app.route('/api/avatars/<filename>')
def serve_avatar(filename):
    return send_from_directory(THUMB_DIR, filename)


# ── Likes ──────────────────────────────────────────────────────────────────────
@app.route('/api/videos/<video_uuid>/like', methods=['POST'])
@jwt_required()
def toggle_like(video_uuid):
    uid     = int(get_jwt_identity())
    video   = Video.query.filter_by(uuid=video_uuid).first_or_404()
    is_like = request.get_json().get('is_like', True)

    existing = Like.query.filter_by(video_id=video.id, user_id=uid).first()
    if existing:
        if existing.is_like == is_like:
            db.session.delete(existing)
            reaction = None
        else:
            existing.is_like = is_like
            reaction = 'like' if is_like else 'dislike'
    else:
        db.session.add(Like(video_id=video.id, user_id=uid, is_like=is_like))
        reaction = 'like' if is_like else 'dislike'

    db.session.commit()
    likes    = Like.query.filter_by(video_id=video.id, is_like=True).count()
    dislikes = Like.query.filter_by(video_id=video.id, is_like=False).count()
    return jsonify({'likes': likes, 'dislikes': dislikes, 'user_reaction': reaction})


# ── Comments ───────────────────────────────────────────────────────────────────
@app.route('/api/videos/<video_uuid>/comments', methods=['GET'])
def get_comments(video_uuid):
    video = Video.query.filter_by(uuid=video_uuid).first_or_404()
    comments = Comment.query.filter_by(video_id=video.id)\
                            .order_by(Comment.created_at.desc()).all()
    return jsonify([c.to_dict() for c in comments])


@app.route('/api/videos/<video_uuid>/comments', methods=['POST'])
@jwt_required()
def add_comment(video_uuid):
    uid   = int(get_jwt_identity())
    video = Video.query.filter_by(uuid=video_uuid).first_or_404()
    text  = (request.get_json() or {}).get('text', '').strip()
    if not text:
        return jsonify({'error': 'Комментарий пуст'}), 422
    if len(text) > 1000:
        return jsonify({'error': 'Слишком длинный комментарий'}), 422
    c = Comment(text=text, video_id=video.id, user_id=uid)
    db.session.add(c)
    db.session.commit()
    db.session.refresh(c)
    return jsonify(c.to_dict()), 201


@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_comment(comment_id):
    uid = int(get_jwt_identity())
    c   = Comment.query.get_or_404(comment_id)
    if c.user_id != uid:
        return jsonify({'error': 'Нет доступа'}), 403
    db.session.delete(c)
    db.session.commit()
    return jsonify({'ok': True})


# ── Subscriptions ──────────────────────────────────────────────────────────────
@app.route('/api/users/<int:channel_id>/subscribe', methods=['POST'])
@jwt_required()
def toggle_subscribe(channel_id):
    uid = int(get_jwt_identity())
    if uid == channel_id:
        return jsonify({'error': 'Нельзя подписаться на себя'}), 400
    User.query.get_or_404(channel_id)
    existing = Subscription.query.filter_by(subscriber_id=uid, channel_id=channel_id).first()
    if existing:
        db.session.delete(existing)
        subscribed = False
    else:
        db.session.add(Subscription(subscriber_id=uid, channel_id=channel_id))
        subscribed = True
    db.session.commit()
    count = Subscription.query.filter_by(channel_id=channel_id).count()
    return jsonify({'subscribed': subscribed, 'subscribers': count})


# ── Serve frontend ─────────────────────────────────────────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    frontend = os.path.join(BASE_DIR, '..', 'frontend')
    if path and os.path.exists(os.path.join(frontend, path)):
        return send_from_directory(frontend, path)
    return send_from_directory(frontend, 'index.html')


# ── Init ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    print('\n🎬  WatchVideo запущен!')
    print('   Локально:  http://localhost:3000')
    print('   В сети:    откройте CMD и выполните: ipconfig')
    print('              используйте IPv4-адрес, например http://192.168.x.x:3000\n')
    app.run(host='0.0.0.0', port=3000, debug=False, threaded=True)
