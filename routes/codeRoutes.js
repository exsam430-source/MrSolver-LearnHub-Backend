// routes/codeRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createLimiter } from '../middleware/rateLimiter.js';
import codeExecutionService from '../services/codeExecutionService.js';
import { securityLog } from '../middleware/auditLog.js';

const router = express.Router();

// ✅ Strict rate limiter for code execution (10 per minute per user)
const codeExecutionLimiter = createLimiter(
  1,
  10,
  'Too many code executions. Please wait a minute.'
);

// ✅ Allowed languages whitelist
const ALLOWED_LANGUAGES = new Set([
  'html', 'css', 'javascript', 'python', 'php',
  'java', 'cpp', 'c', 'csharp', 'ruby', 'go',
  'rust', 'typescript', 'bash', 'sql', 'nodejs',
  'swift', 'kotlin', 'perl', 'r', 'lua'
]);

// ✅ Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /process\.exit/i,
  /fs\.unlink/i,
  /fs\.rmdir/i,
  /fs\.rm\b/i,
  /__import__\s*\(\s*['"`]os['"`]/i,
  /import\s+os\b/i,
  /subprocess/i,
  /System\.exit/i,
  /Runtime\.getRuntime/i,
];

// ✅ Check code for dangerous patterns
const containsDangerousCode = (code, language) => {
  // Only check backend languages
  const backendLanguages = [
    'python', 'nodejs', 'java', 'php',
    'ruby', 'go', 'rust', 'bash'
  ];

  if (!backendLanguages.includes(language)) return false;

  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(code));
};

// =============================================
// POST /api/code/execute
// =============================================
router.post('/execute', protect, codeExecutionLimiter, async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    // ✅ Validate required fields
    if (!language || typeof language !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Language is required',
      });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Code is required',
      });
    }

    // ✅ Validate language against whitelist
    const normalizedLang = language.toLowerCase().trim();
    if (!ALLOWED_LANGUAGES.has(normalizedLang)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${language}`,
      });
    }

    // ✅ Code size limit
    if (code.length > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Code is too long. Maximum 50,000 characters allowed.',
      });
    }

    // ✅ Stdin size limit
    if (stdin && stdin.length > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Input is too long. Maximum 10,000 characters allowed.',
      });
    }

    // ✅ Check for dangerous patterns
    if (containsDangerousCode(code, normalizedLang)) {
      securityLog('DANGEROUS_CODE_BLOCKED', {
        userId: req.user._id,
        language: normalizedLang,
        ip: req.ip,
      });

      return res.status(400).json({
        success: false,
        message: 'Code contains potentially dangerous operations.',
      });
    }

    // ✅ Sanitize stdin
    const safeStdin = stdin
      ? String(stdin).substring(0, 10000)
      : '';

    // ✅ Execute code
    const result = await codeExecutionService.executeCode(
      normalizedLang,
      code,
      safeStdin
    );

    return res.json({
      success: result.success,
      data: {
        output: result.output || '',
        error: result.error || '',
        exitCode: result.exitCode,
        success: result.success,
      },
    });
  } catch (error) {
    console.error('Code execution error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute code. Please try again.',
    });
  }
});

// =============================================
// GET /api/code/languages
// =============================================
router.get('/languages', async (req, res) => {
  try {
    const languages = codeExecutionService.getSupportedLanguages();
    return res.json({
      success: true,
      data: languages,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get languages',
    });
  }
});

export default router;