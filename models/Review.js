import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  title: {
    type: String,
    maxLength: [100, 'Title cannot exceed 100 characters']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    maxLength: [1000, 'Comment cannot exceed 1000 characters']
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  helpfulBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  response: {
    content: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  }
}, {
  timestamps: true
});

// Compound index for unique review per user per course
reviewSchema.index({ course: 1, student: 1 }, { unique: true });

// Static method to calculate average rating
reviewSchema.statics.calculateAverageRating = async function(courseId) {
  const stats = await this.aggregate([
    { $match: { course: courseId, isApproved: true } },
    {
      $group: {
        _id: '$course',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await mongoose.model('Course').findByIdAndUpdate(courseId, {
      'rating.average': Math.round(stats[0].averageRating * 10) / 10,
      'rating.count': stats[0].totalReviews
    });
  } else {
    await mongoose.model('Course').findByIdAndUpdate(courseId, {
      'rating.average': 0,
      'rating.count': 0
    });
  }
};

// Update course rating after save - post hooks don't need next()
reviewSchema.post('save', function(doc) {
  doc.constructor.calculateAverageRating(doc.course);
});

// Update course rating after remove
reviewSchema.post('deleteOne', { document: true, query: false }, function(doc) {
  doc.constructor.calculateAverageRating(doc.course);
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;