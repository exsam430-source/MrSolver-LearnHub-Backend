import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import slugify from 'slugify';

import User from './models/User.js';
import Category from './models/Category.js';
import Course from './models/Course.js';
import Lecture from './models/Lecture.js';
import Enrollment from './models/Enrollment.js';
import Payment from './models/Payment.js';
import Review from './models/Review.js';
import Announcement from './models/Announcement.js';
import Progress from './models/Progress.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

const clearDatabase = async () => {
  console.log('🗑️  Clearing database...');
  
  await User.deleteMany();
  await Category.deleteMany();
  await Course.deleteMany();
  await Lecture.deleteMany();
  await Enrollment.deleteMany();
  await Payment.deleteMany();
  await Review.deleteMany();
  await Announcement.deleteMany();
  await Progress.deleteMany();
  
  // Drop indexes to avoid duplicate key errors
  try {
    await mongoose.connection.collection('categories').dropIndexes();
    await mongoose.connection.collection('courses').dropIndexes();
  } catch (error) {
    // Indexes might not exist, ignore error
  }
  
  console.log('✅ Database cleared');
};

const seedUsers = async () => {
  console.log('👥 Creating users...');
  
  // Create admin
  const admin = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@mrsolverhub.com',
    password: 'MrSolver@26_hub',
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    bio: 'Platform Administrator'
  });
  console.log('   ✅ Admin:', admin.email);

  // Create instructor
  const instructor = await User.create({
    firstName: 'John',
    lastName: 'Instructor',
    email: 'instructor@learnhub.com',
    password: 'instructor123',
    role: 'instructor',
    isActive: true,
    isEmailVerified: true,
    bio: 'Experienced web developer with 10+ years of experience in building scalable applications.',
    socialLinks: {
      linkedin: 'https://linkedin.com/in/johninstructor',
      twitter: 'https://twitter.com/johninstructor',
      github: 'https://github.com/johninstructor'
    }
  });
  console.log('   ✅ Instructor:', instructor.email);

  // Create student
  const student = await User.create({
    firstName: 'Jane',
    lastName: 'Student',
    email: 'student@learnhub.com',
    password: 'student123',
    role: 'student',
    isActive: true,
    isEmailVerified: true
  });
  console.log('   ✅ Student:', student.email);

  // Create additional students
  const student2 = await User.create({
    firstName: 'Bob',
    lastName: 'Learner',
    email: 'bob@example.com',
    password: 'password123',
    role: 'student',
    isActive: true
  });
  console.log('   ✅ Student 2:', student2.email);

  return { admin, instructor, student, student2 };
};

const seedCategories = async () => {
  console.log('📂 Creating categories...');
  
  const categoriesData = [
    {
      name: 'Web Development',
      slug: 'web-development',
      description: 'Learn to build websites and web applications',
      icon: 'code',
      color: '#3B82F6',
      order: 1
    },
    {
      name: 'Mobile Development',
      slug: 'mobile-development',
      description: 'Build mobile apps for iOS and Android',
      icon: 'smartphone',
      color: '#10B981',
      order: 2
    },
    {
      name: 'Data Science',
      slug: 'data-science',
      description: 'Learn data analysis and machine learning',
      icon: 'chart-bar',
      color: '#8B5CF6',
      order: 3
    },
    {
      name: 'Design',
      slug: 'design',
      description: 'UI/UX and graphic design courses',
      icon: 'palette',
      color: '#F59E0B',
      order: 4
    },
    {
      name: 'Business',
      slug: 'business',
      description: 'Business and entrepreneurship courses',
      icon: 'briefcase',
      color: '#EF4444',
      order: 5
    },
    {
      name: 'DevOps',
      slug: 'devops',
      description: 'Learn CI/CD, Docker, Kubernetes and cloud',
      icon: 'server',
      color: '#06B6D4',
      order: 6
    }
  ];

  const categories = [];
  for (const catData of categoriesData) {
    const category = await Category.create(catData);
    categories.push(category);
    console.log('   ✅ Category:', category.name);
  }

  return categories;
};

const seedCourses = async (instructor, categories) => {
  console.log('📚 Creating courses...');
  
  const webDevCategory = categories.find(c => c.slug === 'web-development');
  const dataScienceCategory = categories.find(c => c.slug === 'data-science');
  const mobileCategory = categories.find(c => c.slug === 'mobile-development');

  const coursesData = [
    {
      title: 'Complete Web Development Bootcamp 2024',
      slug: 'complete-web-development-bootcamp-2024',
      description: 'Learn HTML, CSS, JavaScript, React, Node.js and more in this comprehensive course. Build real-world projects and become a full-stack developer.',
      shortDescription: 'Master web development from scratch to advanced level',
      instructor: instructor._id,
      category: webDevCategory._id,
      level: 'beginner',
      language: 'English',
      price: 99.99,
      discountPrice: 49.99,
      isPublished: true,
      isFeatured: true,
      isFreeCourse: false,
      requirements: [
        'Basic computer skills',
        'No programming experience required',
        'A computer with internet connection'
      ],
      whatYouWillLearn: [
        'Build websites from scratch using HTML, CSS, and JavaScript',
        'Master React.js for building modern user interfaces',
        'Create backend APIs with Node.js and Express',
        'Work with databases like MongoDB',
        'Deploy applications to production'
      ],
      targetAudience: [
        'Complete beginners who want to become web developers',
        'Programmers switching to web development',
        'Anyone who wants to build their own websites'
      ],
      tags: ['html', 'css', 'javascript', 'react', 'nodejs', 'mongodb'],
      curriculum: [
        {
          sectionTitle: 'Introduction to Web Development',
          sectionDescription: 'Get started with the basics',
          lectures: [],
          order: 0
        },
        {
          sectionTitle: 'HTML Fundamentals',
          sectionDescription: 'Learn the building blocks of the web',
          lectures: [],
          order: 1
        },
        {
          sectionTitle: 'CSS Styling',
          sectionDescription: 'Make your websites beautiful',
          lectures: [],
          order: 2
        }
      ],
      enrollmentCount: 1250,
      rating: { average: 4.8, count: 324 },
      duration: 2400,
      totalLectures: 185
    },
    {
      title: 'React - The Complete Guide',
      slug: 'react-the-complete-guide',
      description: 'Dive deep into React.js and learn to build modern, reactive web applications. Covers hooks, context, redux, and more.',
      shortDescription: 'Master React.js from beginner to advanced',
      instructor: instructor._id,
      category: webDevCategory._id,
      level: 'intermediate',
      language: 'English',
      price: 89.99,
      discountPrice: 39.99,
      isPublished: true,
      isFeatured: true,
      isFreeCourse: false,
      requirements: [
        'JavaScript knowledge required',
        'Basic HTML and CSS understanding'
      ],
      whatYouWillLearn: [
        'Build powerful React applications',
        'Understand React hooks in depth',
        'State management with Context and Redux',
        'React Router for navigation'
      ],
      targetAudience: [
        'JavaScript developers',
        'Frontend developers'
      ],
      tags: ['react', 'javascript', 'frontend', 'hooks', 'redux'],
      curriculum: [],
      enrollmentCount: 890,
      rating: { average: 4.7, count: 215 },
      duration: 1800,
      totalLectures: 142
    },
    {
      title: 'Python for Data Science and Machine Learning',
      slug: 'python-data-science-machine-learning',
      description: 'Learn Python programming for data analysis, visualization, and machine learning. Work with pandas, numpy, matplotlib, and scikit-learn.',
      shortDescription: 'Complete Python for Data Science course',
      instructor: instructor._id,
      category: dataScienceCategory._id,
      level: 'beginner',
      language: 'English',
      price: 79.99,
      discountPrice: null,
      isPublished: true,
      isFeatured: true,
      isFreeCourse: false,
      requirements: [
        'No programming experience needed',
        'Basic math knowledge helpful'
      ],
      whatYouWillLearn: [
        'Python programming fundamentals',
        'Data analysis with Pandas',
        'Data visualization with Matplotlib',
        'Machine learning with Scikit-learn'
      ],
      targetAudience: [
        'Aspiring data scientists',
        'Business analysts',
        'Anyone interested in data'
      ],
      tags: ['python', 'data-science', 'machine-learning', 'pandas'],
      curriculum: [],
      enrollmentCount: 650,
      rating: { average: 4.6, count: 178 },
      duration: 1500,
      totalLectures: 98
    },
    {
      title: 'JavaScript Basics for Beginners',
      slug: 'javascript-basics-beginners',
      description: 'Start your programming journey with JavaScript. This free course covers all the fundamentals you need to know.',
      shortDescription: 'Free JavaScript course for absolute beginners',
      instructor: instructor._id,
      category: webDevCategory._id,
      level: 'beginner',
      language: 'English',
      price: 0,
      discountPrice: null,
      isPublished: true,
      isFeatured: false,
      isFreeCourse: true,
      requirements: [
        'No prior programming experience needed'
      ],
      whatYouWillLearn: [
        'JavaScript variables and data types',
        'Control flow and loops',
        'Functions and scope',
        'DOM manipulation basics'
      ],
      targetAudience: [
        'Complete beginners',
        'Students starting programming'
      ],
      tags: ['javascript', 'programming', 'beginner', 'free'],
      curriculum: [],
      enrollmentCount: 3200,
      rating: { average: 4.5, count: 512 },
      duration: 300,
      totalLectures: 25
    },
    {
      title: 'Flutter Mobile App Development',
      slug: 'flutter-mobile-app-development',
      description: 'Build beautiful, natively compiled mobile applications for iOS and Android from a single codebase using Flutter and Dart.',
      shortDescription: 'Create cross-platform mobile apps with Flutter',
      instructor: instructor._id,
      category: mobileCategory._id,
      level: 'intermediate',
      language: 'English',
      price: 69.99,
      discountPrice: 34.99,
      isPublished: true,
      isFeatured: false,
      isFreeCourse: false,
      requirements: [
        'Basic programming knowledge',
        'Object-oriented programming concepts'
      ],
      whatYouWillLearn: [
        'Dart programming language',
        'Flutter widgets and layouts',
        'State management',
        'API integration',
        'Publishing apps to stores'
      ],
      targetAudience: [
        'Developers wanting to build mobile apps',
        'Web developers transitioning to mobile'
      ],
      tags: ['flutter', 'dart', 'mobile', 'ios', 'android'],
      curriculum: [],
      enrollmentCount: 420,
      rating: { average: 4.4, count: 89 },
      duration: 1200,
      totalLectures: 78
    }
  ];

  const courses = [];
  for (const courseData of coursesData) {
    const course = await Course.create(courseData);
    courses.push(course);
    console.log('   ✅ Course:', course.title);
  }

  return courses;
};

const seedLectures = async (courses) => {
  console.log('🎬 Creating lectures...');
  
  const webCourse = courses[0]; // Web Development Bootcamp
  
  const lecturesData = [
    {
      title: 'Welcome to the Course',
      description: 'Introduction to the course and what you will learn',
      course: webCourse._id,
      sectionIndex: 0,
      order: 0,
      contentType: 'video',
      isPreview: true,
      isPublished: true,
      duration: 5,
      content: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeId: 'dQw4w9WgXcQ'
      }
    },
    {
      title: 'How the Web Works',
      description: 'Understanding HTTP, browsers, and servers',
      course: webCourse._id,
      sectionIndex: 0,
      order: 1,
      contentType: 'video',
      isPreview: true,
      isPublished: true,
      duration: 15,
      content: {
        youtubeUrl: 'https://www.youtube.com/watch?v=hJHvdBlSxug',
        youtubeId: 'hJHvdBlSxug'
      }
    },
    {
      title: 'Setting Up Your Development Environment',
      description: 'Install VS Code and necessary extensions',
      course: webCourse._id,
      sectionIndex: 0,
      order: 2,
      contentType: 'article',
      isPreview: false,
      isPublished: true,
      duration: 10,
      content: {
        articleContent: '<h1>Setting Up VS Code</h1><p>Visual Studio Code is a free, open-source code editor...</p><h2>Step 1: Download VS Code</h2><p>Go to code.visualstudio.com and download...</p>'
      }
    },
    {
      title: 'Your First HTML Page',
      description: 'Create your very first HTML document',
      course: webCourse._id,
      sectionIndex: 1,
      order: 0,
      contentType: 'video',
      isPreview: false,
      isPublished: true,
      duration: 20
    },
    {
      title: 'HTML Elements and Tags',
      description: 'Understanding the building blocks of HTML',
      course: webCourse._id,
      sectionIndex: 1,
      order: 1,
      contentType: 'video',
      isPreview: false,
      isPublished: true,
      duration: 25
    },
    {
      title: 'HTML Quiz',
      description: 'Test your HTML knowledge',
      course: webCourse._id,
      sectionIndex: 1,
      order: 2,
      contentType: 'quiz',
      isPreview: false,
      isPublished: true,
      duration: 10,
      content: {
        quiz: {
          questions: [
            {
              question: 'What does HTML stand for?',
              options: [
                'Hyper Text Markup Language',
                'High Tech Modern Language',
                'Hyper Transfer Markup Language',
                'Home Tool Markup Language'
              ],
              correctAnswer: 0,
              explanation: 'HTML stands for Hyper Text Markup Language',
              points: 10
            },
            {
              question: 'Which tag is used for the largest heading?',
              options: ['<h6>', '<heading>', '<h1>', '<head>'],
              correctAnswer: 2,
              explanation: '<h1> is used for the largest heading',
              points: 10
            }
          ],
          passingScore: 70,
          timeLimit: 5
        }
      }
    }
  ];

  const lectures = [];
  for (const lectureData of lecturesData) {
    const lecture = await Lecture.create(lectureData);
    lectures.push(lecture);
    
    // Add lecture to course curriculum
    const course = await Course.findById(lecture.course);
    if (course.curriculum[lecture.sectionIndex]) {
      course.curriculum[lecture.sectionIndex].lectures.push(lecture._id);
      await course.save();
    }
  }
  
  console.log('   ✅ Created', lectures.length, 'lectures');
  return lectures;
};

const seedAnnouncements = async (admin) => {
  console.log('📢 Creating announcements...');
  
  const announcements = await Announcement.create([
    {
      title: 'Welcome to LearnHub!',
      content: '<h2>Welcome to our learning platform!</h2><p>We are excited to have you here. Explore our courses and start your learning journey today.</p><p>New courses are added every week!</p>',
      type: 'general',
      priority: 'high',
      targetAudience: 'all',
      author: admin._id,
      isPublished: true,
      isPinned: true,
      publishedAt: new Date()
    },
    {
      title: 'New React Course Available!',
      content: '<p>We just launched our comprehensive React course. Learn modern React with hooks, context, and more!</p><p><strong>Special launch discount: 50% off!</strong></p>',
      type: 'general',
      priority: 'medium',
      targetAudience: 'students',
      author: admin._id,
      isPublished: true,
      isPinned: false,
      publishedAt: new Date()
    }
  ]);
  
  console.log('   ✅ Created', announcements.length, 'announcements');
  return announcements;
};

const seedData = async () => {
  try {
    await connectDB();
    await clearDatabase();

    // Seed in order
    const users = await seedUsers();
    const categories = await seedCategories();
    const courses = await seedCourses(users.instructor, categories);
    const lectures = await seedLectures(courses);
    const announcements = await seedAnnouncements(users.admin);

    console.log('\n' + '='.repeat(50));
    console.log('✅ DATABASE SEEDED SUCCESSFULLY!');
    console.log('='.repeat(50));
    
    console.log('\n📋 Test Accounts:');
    console.log('─'.repeat(40));
    console.log('👤 Admin:      admin@learnhub.com / admin123');
    console.log('👨‍🏫 Instructor: instructor@learnhub.com / instructor123');
    console.log('👨‍🎓 Student:    student@learnhub.com / student123');
    console.log('👨‍🎓 Student 2:  bob@example.com / password123');
    
    console.log('\n📊 Summary:');
    console.log('─'.repeat(40));
    console.log(`   Users:         4`);
    console.log(`   Categories:    ${categories.length}`);
    console.log(`   Courses:       ${courses.length}`);
    console.log(`   Lectures:      ${lectures.length}`);
    console.log(`   Announcements: ${announcements.length}`);
    
    console.log('\n🚀 You can now start the server with: npm run dev\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error.message);
    console.error(error);
    process.exit(1);
  }
};

// Run seeder
seedData();