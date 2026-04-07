// models/Lecture.js
import mongoose from 'mongoose';

const lectureSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Lecture title is required'],
    trim: true,
    maxLength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    maxLength: [1000, 'Description cannot exceed 1000 characters']
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  sectionIndex: {
    type: Number,
    default: 0
  },
  order: {
    type: Number,
    default: 0
  },
  contentType: {
    type: String,
    enum: ['video', 'youtube', 'article', 'quiz', 'assignment', 'file', 'zoom', 'interactive', 'lesson'],
    required: true
  },
  content: {
    // For video uploads
    videoUrl: String,
    videoDuration: Number,

    // For YouTube videos
    youtubeUrl: String,
    youtubeId: String,

    // For articles
    articleContent: String,

    // For interactive code (W3Schools style)
    interactive: {
      instructions: String,
      initialCode: {
        html: { type: String, default: '' },
        css: { type: String, default: '' },
        js: { type: String, default: '' },
        python: { type: String, default: '' },
        php: { type: String, default: '' },
        java: { type: String, default: '' },
        cpp: { type: String, default: '' },
        csharp: { type: String, default: '' },
        ruby: { type: String, default: '' },
        go: { type: String, default: '' },
        rust: { type: String, default: '' },
        sql: { type: String, default: '' },
        bash: { type: String, default: '' }
      },
      solution: {
        html: { type: String, default: '' },
        css: { type: String, default: '' },
        js: { type: String, default: '' },
        python: { type: String, default: '' },
        php: { type: String, default: '' },
        java: { type: String, default: '' },
        cpp: { type: String, default: '' },
        csharp: { type: String, default: '' },
        ruby: { type: String, default: '' },
        go: { type: String, default: '' },
        rust: { type: String, default: '' },
        sql: { type: String, default: '' },
        bash: { type: String, default: '' }
      },
      codeType: {
        type: String,
        enum: [
          'html', 'css', 'javascript', 'htmlcss', 'htmljs', 'fullstack',
          'python', 'php', 'java', 'cpp', 'csharp', 'ruby', 'go', 'rust', 
          'sql', 'bash', 'nodejs', 'typescript'
        ],
        default: 'html'
      }
    },

    // For lesson/notes type (W3Schools style)
    lesson: {
      sections: [{
        type: {
          type: String,
          enum: ['heading', 'paragraph', 'list', 'code-example', 'note', 'table', 'divider', 'html-structure', 'image', 'video-embed']
        },
        content: String,
        level: Number,
        items: [String],
        listType: { type: String, enum: ['ordered', 'unordered'], default: 'unordered' },
        noteType: { type: String, enum: ['note', 'tip', 'warning', 'info'], default: 'note' },
        title: String,
        // Multi-language code support
        code: {
          html: { type: String, default: '' },
          css: { type: String, default: '' },
          js: { type: String, default: '' },
          python: { type: String, default: '' },
          php: { type: String, default: '' },
          java: { type: String, default: '' },
          cpp: { type: String, default: '' },
          csharp: { type: String, default: '' },
          ruby: { type: String, default: '' },
          go: { type: String, default: '' },
          rust: { type: String, default: '' },
          sql: { type: String, default: '' },
          bash: { type: String, default: '' },
          nodejs: { type: String, default: '' },
          typescript: { type: String, default: '' }
        },
        solution: {
          html: { type: String, default: '' },
          css: { type: String, default: '' },
          js: { type: String, default: '' },
          python: { type: String, default: '' },
          php: { type: String, default: '' },
          java: { type: String, default: '' },
          cpp: { type: String, default: '' },
          csharp: { type: String, default: '' },
          ruby: { type: String, default: '' },
          go: { type: String, default: '' },
          rust: { type: String, default: '' },
          sql: { type: String, default: '' },
          bash: { type: String, default: '' },
          nodejs: { type: String, default: '' },
          typescript: { type: String, default: '' }
        },
        codeType: {
          type: String,
          enum: [
            'html', 'css', 'javascript', 'htmlcss', 'htmljs', 'fullstack',
            'python', 'php', 'java', 'cpp', 'csharp', 'ruby', 'go', 'rust',
            'sql', 'bash', 'nodejs', 'typescript'
          ],
          default: 'html'
        },
        language: { type: String, default: 'html' }, // Primary language for this code block
        explanation: String,
        headers: [String],
        rows: [[String]],
        imageUrl: String,
        imageAlt: String,
        videoUrl: String,
        isTryIt: { type: Boolean, default: false }
      }]
    },

    // For Zoom meetings
    zoom: {
      meetingUrl: String,
      meetingId: String,
      password: String,
      hostEmail: String,
      scheduledAt: Date,
      duration: Number,
      topic: String,
      isRecurring: { type: Boolean, default: false },
      recurringSchedule: String
    },

    // For files
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    fileType: String,

    // For quizzes
    quiz: {
      questions: [{
        question: String,
        options: [String],
        correctAnswer: Number,
        explanation: String,
        points: { type: Number, default: 1 }
      }],
      passingScore: { type: Number, default: 70 },
      timeLimit: Number
    },

    // For assignments
    assignment: {
      instructions: String,
      dueDate: Date,
      maxScore: Number,
      attachments: [String]
    }
  },
  resources: [{
    title: String,
    type: String,
    url: String
  }],
  isPreview: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  duration: {
    type: Number,
    default: 0
  },
  watchSettings: {
    maxWatches: { type: Number, default: 0 },
    allowRewind: { type: Boolean, default: true },
    allowSpeedChange: { type: Boolean, default: true },
    trackWatchTime: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

lectureSchema.index({ course: 1, sectionIndex: 1, order: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);

export default Lecture;