import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import glucoseRoutes from './routes/glucose.js';
import foodRoutes from './routes/food.js';
import mealPlanRoutes from './routes/mealPlan.js';
import alertRoutes from './routes/alerts.js';
import chatRoutes from './routes/chat.js';
import doctorRoutes from './routes/doctor.js';
import profileRoutes from './routes/profile.js';
import ragRoutes from './routes/rag.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/glucose', glucoseRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/meal-plan', mealPlanRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/rag', ragRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// Serve React frontend from client/dist
const clientDistPath = path.join(__dirname, '../../client/dist');

app.use(express.static(clientDistPath));

// React Router fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () =>
  console.log(`GlucoAI server running on http://localhost:${PORT}`)
);
