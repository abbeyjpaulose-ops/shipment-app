import app from './app.js';

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const port = toPositiveInt(process.env.PORT, 3000);
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
