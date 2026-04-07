// services/codeExecutionService.js
import axios from 'axios';

// Using Piston API (free, open-source code execution engine)
// You can self-host or use public API: https://emkc.org/api/v2/piston/execute
const PISTON_API_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

// Language configurations for Piston API
const LANGUAGE_CONFIG = {
  python: { language: 'python', version: '3.10.0' },
  python3: { language: 'python', version: '3.10.0' },
  php: { language: 'php', version: '8.2.3' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'cpp', version: '10.2.0' },
  'c++': { language: 'cpp', version: '10.2.0' },
  c: { language: 'c', version: '10.2.0' },
  csharp: { language: 'csharp', version: '6.12.0' },
  'c#': { language: 'csharp', version: '6.12.0' },
  ruby: { language: 'ruby', version: '3.0.1' },
  go: { language: 'go', version: '1.16.2' },
  golang: { language: 'go', version: '1.16.2' },
  rust: { language: 'rust', version: '1.68.2' },
  javascript: { language: 'javascript', version: '18.15.0' },
  nodejs: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  bash: { language: 'bash', version: '5.2.0' },
  sql: { language: 'sqlite3', version: '3.36.0' },
  swift: { language: 'swift', version: '5.3.3' },
  kotlin: { language: 'kotlin', version: '1.8.20' },
  perl: { language: 'perl', version: '5.36.0' },
  r: { language: 'r', version: '4.1.1' },
  scala: { language: 'scala', version: '3.2.2' },
  lua: { language: 'lua', version: '5.4.4' },
};

// File extensions for each language
const FILE_EXTENSIONS = {
  python: 'py',
  php: 'php',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  ruby: 'rb',
  go: 'go',
  rust: 'rs',
  javascript: 'js',
  typescript: 'ts',
  bash: 'sh',
  sql: 'sql',
  swift: 'swift',
  kotlin: 'kt',
  perl: 'pl',
  r: 'r',
  scala: 'scala',
  lua: 'lua',
};

export const codeExecutionService = {
  /**
   * Execute code using Piston API
   * @param {string} language - Programming language
   * @param {string} code - Code to execute
   * @param {string} stdin - Standard input (optional)
   * @returns {Promise<{output: string, error: string, exitCode: number}>}
   */
  async executeCode(language, code, stdin = '') {
    try {
      const langConfig = LANGUAGE_CONFIG[language.toLowerCase()];
      
      if (!langConfig) {
        return {
          output: '',
          error: `Unsupported language: ${language}. Supported languages: ${Object.keys(LANGUAGE_CONFIG).join(', ')}`,
          exitCode: 1,
          success: false
        };
      }

      const response = await axios.post(`${PISTON_API_URL}/execute`, {
        language: langConfig.language,
        version: langConfig.version,
        files: [
          {
            name: `main.${FILE_EXTENSIONS[langConfig.language] || 'txt'}`,
            content: code
          }
        ],
        stdin: stdin,
        args: [],
        compile_timeout: 10000,
        run_timeout: 5000,
        compile_memory_limit: -1,
        run_memory_limit: -1
      });

      const { run, compile } = response.data;

      // Check for compilation errors
      if (compile && compile.code !== 0) {
        return {
          output: compile.output || '',
          error: compile.stderr || compile.output || 'Compilation failed',
          exitCode: compile.code,
          success: false
        };
      }

      return {
        output: run.stdout || '',
        error: run.stderr || '',
        exitCode: run.code,
        success: run.code === 0
      };
    } catch (error) {
      console.error('Code execution error:', error);
      return {
        output: '',
        error: error.response?.data?.message || error.message || 'Failed to execute code',
        exitCode: 1,
        success: false
      };
    }
  },

  /**
   * Get available languages from Piston
   */
  async getAvailableLanguages() {
    try {
      const response = await axios.get(`${PISTON_API_URL}/runtimes`);
      return response.data;
    } catch (error) {
      console.error('Failed to get languages:', error);
      return Object.keys(LANGUAGE_CONFIG);
    }
  },

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language) {
    return !!LANGUAGE_CONFIG[language.toLowerCase()];
  },

  /**
   * Get supported languages list
   */
  getSupportedLanguages() {
    return [
      { value: 'html', label: 'HTML', category: 'web' },
      { value: 'css', label: 'CSS', category: 'web' },
      { value: 'javascript', label: 'JavaScript', category: 'web' },
      { value: 'htmlcss', label: 'HTML + CSS', category: 'web' },
      { value: 'htmljs', label: 'HTML + JS', category: 'web' },
      { value: 'fullstack', label: 'HTML + CSS + JS', category: 'web' },
      { value: 'python', label: 'Python', category: 'backend' },
      { value: 'php', label: 'PHP', category: 'backend' },
      { value: 'nodejs', label: 'Node.js', category: 'backend' },
      { value: 'java', label: 'Java', category: 'backend' },
      { value: 'cpp', label: 'C++', category: 'backend' },
      { value: 'c', label: 'C', category: 'backend' },
      { value: 'csharp', label: 'C#', category: 'backend' },
      { value: 'ruby', label: 'Ruby', category: 'backend' },
      { value: 'go', label: 'Go', category: 'backend' },
      { value: 'rust', label: 'Rust', category: 'backend' },
      { value: 'typescript', label: 'TypeScript', category: 'backend' },
      { value: 'swift', label: 'Swift', category: 'mobile' },
      { value: 'kotlin', label: 'Kotlin', category: 'mobile' },
      { value: 'sql', label: 'SQL', category: 'database' },
      { value: 'bash', label: 'Bash', category: 'system' },
      { value: 'perl', label: 'Perl', category: 'scripting' },
      { value: 'r', label: 'R', category: 'data' },
      { value: 'lua', label: 'Lua', category: 'scripting' },
    ];
  }
};

export default codeExecutionService;