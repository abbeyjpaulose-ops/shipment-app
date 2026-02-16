let appPromise;

module.exports = async (req, res) => {
  try {
    const rawUrl = String(req.url || '/');
    if (!rawUrl.startsWith('/api/')) {
      req.url = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }

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
