// routes/codeRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import codeExecutionService from '../services/codeExecutionService.js';

const router = express.Router();

// Execute code
router.post('/execute', protect, async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    if (!language || !code) {
      return res.status(400).json({
        success: false,
        message: 'Language and code are required'
      });
    }

    // Rate limiting check (you might want to add more sophisticated rate limiting)
    // Basic security: limit code length
    if (code.length > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Code is too long (max 50,000 characters)'
      });
    }

    const result = await codeExecutionService.executeCode(language, code, stdin);

    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute code',
      error: error.message
    });
  }
});

// Get supported languages
router.get('/languages', async (req, res) => {
  try {
    const languages = codeExecutionService.getSupportedLanguages();
    res.json({
      success: true,
      data: languages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get languages'
    });
  }
});

export default router;