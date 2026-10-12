// services/codeExecutionService.js
import axios from 'axios';

// ✅ Use env variable - never hardcode
const PISTON_API_URL =
  process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

// ✅ Request timeout (10 seconds max)
const PISTON_TIMEOUT = 10000;

// ✅ Language configurations for Piston API
const LANGUAGE_CONFIG = {
  python:     { language: 'python',     version: '3.10.0',  ext: 'py'    },
  python3:    { language: 'python',     version: '3.10.0',  ext: 'py'    },
  php:        { language: 'php',        version: '8.2.3',   ext: 'php'   },
  java:       { language: 'java',       version: '15.0.2',  ext: 'java'  },
  cpp:        { language: 'cpp',        version: '10.2.0',  ext: 'cpp'   },
  c:          { language: 'c',          version: '10.2.0',  ext: 'c'     },
  csharp:     { language: 'csharp',     version: '6.12.0',  ext: 'cs'    },
  ruby:       { language: 'ruby',       version: '3.0.1',   ext: 'rb'    },
  go:         { language: 'go',         version: '1.16.2',  ext: 'go'    },
  rust:       { language: 'rust',       version: '1.68.2',  ext: 'rs'    },
  javascript: { language: 'javascript', version: '18.15.0', ext: 'js'    },
  nodejs:     { language: 'javascript', version: '18.15.0', ext: 'js'    },
  typescript: { language: 'typescript', version: '5.0.3',   ext: 'ts'    },
  bash:       { language: 'bash',       version: '5.2.0',   ext: 'sh'    },
  sql:        { language: 'sqlite3',    version: '3.36.0',  ext: 'sql'   },
  swift:      { language: 'swift',      version: '5.3.3',   ext: 'swift' },
  kotlin:     { language: 'kotlin',     version: '1.8.20',  ext: 'kt'    },
  perl:       { language: 'perl',       version: '5.36.0',  ext: 'pl'    },
  r:          { language: 'r',          version: '4.1.1',   ext: 'r'     },
  lua:        { language: 'lua',        version: '5.4.4',   ext: 'lua'   },
};

// ✅ Dangerous patterns - block before sending to API
const DANGEROUS_PATTERNS = [
  /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
  /exec\s*\(\s*['"`]/i,
  /spawn\s*\(/i,
  /process\.exit/i,
  /fs\.unlink\b/i,
  /fs\.rmdir\b/i,
  /fs\.rm\b/i,
  /__import__\s*\(\s*['"`]os['"`]/i,
  /subprocess\s*\./i,
  /System\.exit/i,
  /Runtime\.getRuntime/i,
  /ProcessBuilder/i,
  /os\.system\s*\(/i,
  /os\.popen\s*\(/i,
  /eval\s*\(\s*compile/i,
];

// ✅ Backend languages that need pattern checking
const BACKEND_LANGUAGES = new Set([
  'python', 'nodejs', 'java', 'php',
  'ruby', 'go', 'rust', 'bash', 'perl',
  'csharp', 'cpp', 'c', 'kotlin', 'swift',
]);

// ✅ Max output size (prevent huge outputs)
const MAX_OUTPUT_LENGTH = 10000;

// ✅ Truncate output safely
const truncateOutput = (str) => {
  if (!str) return '';
  const s = String(str);
  if (s.length <= MAX_OUTPUT_LENGTH) return s;
  return s.substring(0, MAX_OUTPUT_LENGTH) +
    '\n\n... [Output truncated - too long]';
};

// ✅ Check for dangerous patterns
const containsDangerousCode = (code, language) => {
  if (!BACKEND_LANGUAGES.has(language)) return false;
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(code));
};

// ✅ Sanitize output - remove ANSI escape codes
const sanitizeOutput = (output) => {
  if (!output) return '';
  return String(output)
    // Remove ANSI color codes
    .replace(/\x1B\[[0-9;]*[mGKHF]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    .trim();
};

export const codeExecutionService = {

  // ============================================
  // EXECUTE CODE
  // ============================================
  async executeCode(language, code, stdin = '') {
    try {
      // ✅ Normalize language
      const normalizedLang = language.toLowerCase().trim();

      // ✅ Check language support
      const langConfig = LANGUAGE_CONFIG[normalizedLang];
      if (!langConfig) {
        return {
          output:   '',
          error:    `Unsupported language: ${language}`,
          exitCode: 1,
          success:  false,
        };
      }

      // ✅ Check code size
      if (!code || typeof code !== 'string') {
        return {
          output:   '',
          error:    'No code provided',
          exitCode: 1,
          success:  false,
        };
      }

      if (code.length > 50000) {
        return {
          output:   '',
          error:    'Code too long. Maximum 50,000 characters allowed.',
          exitCode: 1,
          success:  false,
        };
      }

      // ✅ Check stdin size
      const safeStdin = stdin
        ? String(stdin).substring(0, 10000)
        : '';

      // ✅ Dangerous pattern check
      if (containsDangerousCode(code, normalizedLang)) {
        return {
          output:   '',
          error:    'Code contains potentially dangerous operations.',
          exitCode: 1,
          success:  false,
        };
      }

      // ✅ Call Piston API with timeout
      const response = await axios.post(
        `${PISTON_API_URL}/execute`,
        {
          language: langConfig.language,
          version:  langConfig.version,
          files: [
            {
              name:    `main.${langConfig.ext}`,
              content: code,
            },
          ],
          stdin:               safeStdin,
          args:                [],
          compile_timeout:     10000,
          run_timeout:         5000,
          compile_memory_limit: -1,
          run_memory_limit:    -1,
        },
        {
          timeout: PISTON_TIMEOUT,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const { run, compile } = response.data;

      // ✅ Compilation error
      if (compile && compile.code !== 0) {
        return {
          output:   truncateOutput(sanitizeOutput(compile.output || '')),
          error:    truncateOutput(sanitizeOutput(
            compile.stderr || compile.output || 'Compilation failed'
          )),
          exitCode: compile.code,
          success:  false,
        };
      }

      // ✅ Runtime result
      return {
        output:   truncateOutput(sanitizeOutput(run.stdout || '')),
        error:    truncateOutput(sanitizeOutput(run.stderr  || '')),
        exitCode: run.code,
        success:  run.code === 0,
      };

    } catch (error) {
      // ✅ Timeout error
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          output:   '',
          error:    'Execution timed out. Please simplify your code.',
          exitCode: 1,
          success:  false,
        };
      }

      // ✅ Network error
      if (!error.response) {
        return {
          output:   '',
          error:    'Cannot connect to code execution service.',
          exitCode: 1,
          success:  false,
        };
      }

      // ✅ API error
      return {
        output:   '',
        error:    error.response?.data?.message ||
                  'Failed to execute code. Please try again.',
        exitCode: 1,
        success:  false,
      };
    }
  },

  // ============================================
  // GET AVAILABLE LANGUAGES
  // ============================================
  async getAvailableLanguages() {
    try {
      const response = await axios.get(
        `${PISTON_API_URL}/runtimes`,
        { timeout: 5000 }
      );
      return response.data || [];
    } catch (error) {
      // ✅ Return local list on failure
      return this.getSupportedLanguages();
    }
  },

  // ============================================
  // CHECK LANGUAGE SUPPORT
  // ============================================
  isLanguageSupported(language) {
    if (!language || typeof language !== 'string') return false;
    return !!LANGUAGE_CONFIG[language.toLowerCase().trim()];
  },

  // ============================================
  // GET SUPPORTED LANGUAGES LIST
  // ============================================
  getSupportedLanguages() {
    return [
      // Web (browser)
      { value: 'html',       label: 'HTML',          category: 'web',      browser: true  },
      { value: 'css',        label: 'CSS',           category: 'web',      browser: true  },
      { value: 'javascript', label: 'JavaScript',    category: 'web',      browser: true  },
      { value: 'htmlcss',    label: 'HTML + CSS',    category: 'web',      browser: true  },
      { value: 'htmljs',     label: 'HTML + JS',     category: 'web',      browser: true  },
      { value: 'fullstack',  label: 'Full Stack',    category: 'web',      browser: true  },
      // Backend (server)
      { value: 'python',     label: 'Python',        category: 'backend',  browser: false },
      { value: 'nodejs',     label: 'Node.js',       category: 'backend',  browser: false },
      { value: 'java',       label: 'Java',          category: 'backend',  browser: false },
      { value: 'cpp',        label: 'C++',           category: 'backend',  browser: false },
      { value: 'c',          label: 'C',             category: 'backend',  browser: false },
      { value: 'csharp',     label: 'C#',            category: 'backend',  browser: false },
      { value: 'php',        label: 'PHP',           category: 'backend',  browser: false },
      { value: 'ruby',       label: 'Ruby',          category: 'backend',  browser: false },
      { value: 'go',         label: 'Go',            category: 'backend',  browser: false },
      { value: 'rust',       label: 'Rust',          category: 'backend',  browser: false },
      { value: 'typescript', label: 'TypeScript',    category: 'backend',  browser: false },
      // Mobile
      { value: 'swift',      label: 'Swift',         category: 'mobile',   browser: false },
      { value: 'kotlin',     label: 'Kotlin',        category: 'mobile',   browser: false },
      // Database
      { value: 'sql',        label: 'SQL',           category: 'database', browser: false },
      // System
      { value: 'bash',       label: 'Bash',          category: 'system',   browser: false },
      // Scripting
      { value: 'perl',       label: 'Perl',          category: 'scripting',browser: false },
      { value: 'r',          label: 'R',             category: 'data',     browser: false },
      { value: 'lua',        label: 'Lua',           category: 'scripting',browser: false },
    ];
  },
};

export default codeExecutionService;