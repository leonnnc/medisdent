"""
DentalPro — server.py
Servidor Flask: sirve el sitio web + API para subida de imágenes
Las citas se manejan desde el frontend con Firebase Firestore
"""

import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ── Configuración ──────────────────────────────────
UPLOAD_FOLDER   = os.path.join(os.path.dirname(__file__), 'img')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB

app.config['UPLOAD_FOLDER']      = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ── Rutas estáticas ────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/cpanel')
@app.route('/cpanel.html')
def cpanel():
    return send_from_directory('.', 'cpanel.html')

# ── API: subir imagen ──────────────────────────────
@app.route('/api/upload', methods=['POST'])
def upload_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Tipo de archivo no permitido. Usa JPG, PNG, GIF, WEBP o AVIF'}), 400

    # Nombre único para evitar colisiones
    ext      = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    url = f"/img/{filename}"
    return jsonify({'url': url, 'filename': filename}), 200

# ── API: listar imágenes subidas ───────────────────
@app.route('/api/images', methods=['GET'])
def list_images():
    files = []
    for f in os.listdir(UPLOAD_FOLDER):
        if allowed_file(f):
            files.append({'filename': f, 'url': f'/img/{f}'})
    files.sort(key=lambda x: x['filename'], reverse=True)
    return jsonify(files)

# ── API: eliminar imagen ───────────────────────────
@app.route('/api/images/<filename>', methods=['DELETE'])
def delete_image(filename):
    safe = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe)
    if os.path.exists(filepath):
        os.remove(filepath)
        return jsonify({'ok': True})
    return jsonify({'error': 'Archivo no encontrado'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7432))
    print(f"\n  ✦ DentalPro corriendo en http://localhost:{port}")
    print(f"  ✦ Panel de control en  http://localhost:{port}/cpanel\n")
    app.run(host='0.0.0.0', port=port, debug=False)
