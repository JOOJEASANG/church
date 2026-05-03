/* =============================================================
 * 천안남산교회 — 공용 유틸 (이미지 리사이즈, 편집 헬퍼)
 * ============================================================= */

/**
 * 클라이언트에서 이미지를 리사이즈한다 (Storage 비용·로딩속도 절감).
 * @param {File} file 원본 파일
 * @param {Object} opts
 * @param {number} opts.maxDim   가장 긴 변의 최대 픽셀 (기본 1920)
 * @param {number} opts.quality  JPEG 품질 0~1 (기본 0.85)
 * @param {string} opts.mime     출력 MIME (기본 image/jpeg)
 * @returns {Promise<File>} 리사이즈된 파일 (원본보다 작을 때만)
 */
export function resizeImage(file, opts = {}) {
  const { maxDim = 1920, quality = 0.85, mime = 'image/jpeg' } = opts;
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const longest = Math.max(img.width, img.height);
      const scale = Math.min(1, maxDim / longest);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('리사이즈 실패')); return; }
        // 원본보다 큰 결과면 원본 사용
        if (blob.size >= file.size && file.type === mime) { resolve(file); return; }
        const ext = mime === 'image/png' ? 'png' : 'jpg';
        const newName = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
        resolve(new File([blob], newName, { type: mime }));
      }, mime, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로딩 실패')); };
    img.src = url;
  });
}

/** 사람이 읽기 쉬운 파일 크기 */
export function humanSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
