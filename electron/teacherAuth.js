const TEACHER_PASSWORD = "16122002";

function verifyTeacherPassword(password) {
  return String(password || "") === TEACHER_PASSWORD;
}

module.exports = { verifyTeacherPassword };
