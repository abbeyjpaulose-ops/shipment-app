let appPromise;

function rewriteToApiPath(req) {
  const parsed = new URL(String(req.url || '/'), 'http://localhost');
  const pathParam = String(parsed.searchParams.get('path') || '').replace(/^\/+/, '');
  parsed.searchParams.delete('path');
  const query = parsed.searchParams.toString();
  req.url = `/api/${pathParam}${query ? `?${query}` : ''}`;
}

module.exports = async (req, res) => {
  try {
    rewriteToApiPath(req);
    if (!appPromise) {
      appPromise = import('../../shipment-backend/app.js').then((mod) => mod.default);
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    console.error('Failed to initialize API handler:', err);
    return res.status(500).json({ message: 'Server configuration error' });
  }
};

