'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Simple token generation for dashboard access
// In production, add bcrypt password hashing
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ZERODHA_CLIENT_ID &&
    password === process.env.ZERODHA_PASSWORD
  ) {
    const token = jwt.sign(
      { id: username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    return res.json({ token, user: { id: username, role: 'admin' } });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ valid: false });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;
