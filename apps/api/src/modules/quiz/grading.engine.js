// Auto-grading engine — handles all question types except essay (always manual).
// Returns { isCorrect, pointsAwarded } for each answer.

function gradeAnswer(question, answer, settings = {}) {
  const maxPoints = answer.maxPoints || question.points || 1;
  const negativePts = settings.negativeMarking ? (answer.negativePoints ?? question.negativePoints ?? 0) : 0;

  switch (question.type) {
    case 'multiple_choice':
    case 'image': {
      const correct = question.options.find(o => o.isCorrect);
      const isCorrect = correct && answer.selectedOptionId === correct._id.toString();
      return {
        isCorrect: !!isCorrect,
        pointsAwarded: isCorrect ? maxPoints : (answer.selectedOptionId ? -negativePts : 0),
      };
    }

    case 'true_false': {
      const correct = question.options.find(o => o.isCorrect);
      const isCorrect = correct && answer.selectedOptionId === correct._id.toString();
      return {
        isCorrect: !!isCorrect,
        pointsAwarded: isCorrect ? maxPoints : (answer.selectedOptionId ? -negativePts : 0),
      };
    }

    case 'multiple_select': {
      const correctIds = question.options
        .filter(o => o.isCorrect)
        .map(o => o._id.toString())
        .sort();
      const studentIds = [...(answer.selectedOptionIds || [])].sort();
      const isCorrect =
        correctIds.length === studentIds.length &&
        correctIds.every((id, i) => id === studentIds[i]);
      return {
        isCorrect,
        pointsAwarded: isCorrect ? maxPoints : (studentIds.length ? -negativePts : 0),
      };
    }

    case 'fill_blank': {
      const expected = (question.correctAnswer || '').trim().toLowerCase();
      const given = (answer.textAnswer || '').trim().toLowerCase();
      const isCorrect = expected.length > 0 && expected === given;
      return {
        isCorrect,
        pointsAwarded: isCorrect ? maxPoints : (given ? -negativePts : 0),
      };
    }

    case 'short_answer': {
      // Keyword-match: answer must contain the correct answer string (case-insensitive)
      const expected = (question.correctAnswer || '').trim().toLowerCase();
      const given = (answer.textAnswer || '').trim().toLowerCase();
      const isCorrect = expected.length > 0 && given.includes(expected);
      return {
        isCorrect,
        pointsAwarded: isCorrect ? maxPoints : 0, // no negative for short_answer
      };
    }

    case 'essay': {
      // Always manual — return null until instructor grades
      return { isCorrect: null, pointsAwarded: 0 };
    }

    case 'matching': {
      if (!question.matchingPairs?.length) return { isCorrect: false, pointsAwarded: 0 };
      const studentMap = Object.fromEntries(
        (answer.matchingAnswer || []).map(a => [a.left, a.right])
      );
      const allCorrect = question.matchingPairs.every(
        pair => studentMap[pair.left]?.trim().toLowerCase() === pair.right.trim().toLowerCase()
      );
      return {
        isCorrect: allCorrect,
        pointsAwarded: allCorrect ? maxPoints : (answer.matchingAnswer?.length ? -negativePts : 0),
      };
    }

    case 'ordering': {
      const correctOrder = question.correctOrder || [];
      const studentOrder = answer.orderingAnswer || [];
      const isCorrect =
        correctOrder.length === studentOrder.length &&
        correctOrder.every((val, i) => String(val) === String(studentOrder[i]));
      return {
        isCorrect,
        pointsAwarded: isCorrect ? maxPoints : (studentOrder.length ? -negativePts : 0),
      };
    }

    default:
      return { isCorrect: false, pointsAwarded: 0 };
  }
}

function gradeAttempt(questions, answers, settings = {}) {
  let totalScore = 0;
  let maxScore = 0;
  let hasManual = false;

  const gradedAnswers = answers.map(answer => {
    const question = questions.find(q => q._id.toString() === answer.questionId.toString());
    if (!question) return answer;

    const pts = answer.maxPoints || question.points || 1;
    maxScore += pts;

    if (question.type === 'essay') {
      hasManual = true;
      return { ...answer, isCorrect: null, pointsAwarded: 0 };
    }

    const { isCorrect, pointsAwarded } = gradeAnswer(question, answer, settings);
    totalScore += Math.max(0, pointsAwarded); // score cannot go below 0
    return { ...answer, isCorrect, pointsAwarded: Math.max(0, pointsAwarded) };
  });

  return { gradedAnswers, totalScore, maxScore, hasManual };
}

module.exports = { gradeAnswer, gradeAttempt };
