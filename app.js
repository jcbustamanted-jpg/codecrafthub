// app.js

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = 5000;

const COURSES_FILE = path.join(__dirname, "courses.json");

const ALLOWED_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed"
];

app.use(express.json());

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Create courses.json automatically if it does not exist
async function ensureCoursesFile() {
  try {
    await fs.access(COURSES_FILE);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(COURSES_FILE, "[]", "utf8");
    } else {
      throw error;
    }
  }
}

// Read courses from courses.json
async function readCourses() {
  try {
    await ensureCoursesFile();

    const fileContents = await fs.readFile(COURSES_FILE, "utf8");

    if (!fileContents.trim()) {
      return [];
    }

    const courses = JSON.parse(fileContents);

    if (!Array.isArray(courses)) {
      throw new Error("courses.json must contain a JSON array");
    }

    return courses;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createError(
        "Unable to read courses.json because it contains invalid JSON",
        500
      );
    }

    if (!error.statusCode) {
      error.statusCode = 500;
      error.message = `Unable to read courses.json: ${error.message}`;
    }

    throw error;
  }
}

// Write courses to courses.json
async function writeCourses(courses) {
  try {
    const fileContents = JSON.stringify(courses, null, 2);
    await fs.writeFile(COURSES_FILE, fileContents, "utf8");
  } catch (error) {
    throw createError(
      `Unable to write to courses.json: ${error.message}`,
      500
    );
  }
}

// Validate YYYY-MM-DD date
function isValidDate(dateString) {
  if (typeof dateString !== "string") {
    return false;
  }

  const dateFormat = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateFormat.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Validate course data
function validateCourseData(courseData) {
  const errors = [];

  if (
    !courseData.name ||
    typeof courseData.name !== "string" ||
    !courseData.name.trim()
  ) {
    errors.push("name is required");
  }

  if (
    !courseData.description ||
    typeof courseData.description !== "string" ||
    !courseData.description.trim()
  ) {
    errors.push("description is required");
  }

  if (!courseData.target_date) {
    errors.push("target_date is required");
  } else if (!isValidDate(courseData.target_date)) {
    errors.push("target_date must use the format YYYY-MM-DD");
  }

  if (!courseData.status) {
    errors.push("status is required");
  } else if (!ALLOWED_STATUSES.includes(courseData.status)) {
    errors.push(
      `status must be one of: ${ALLOWED_STATUSES.join(", ")}`
    );
  }

  return errors;
}

function findCourseById(courses, id) {
  const numericId = Number(id);
  return courses.find((course) => course.id === numericId);
}

// POST - Add a course
app.post("/api/courses", async (req, res, next) => {
  try {
    const courseData = req.body;
    const validationErrors = validateCourseData(courseData);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Course validation failed",
        details: validationErrors
      });
    }

    const courses = await readCourses();

    const highestId = courses.reduce((highest, course) => {
      return Math.max(highest, Number(course.id) || 0);
    }, 0);

    const newCourse = {
      id: highestId + 1,
      name: courseData.name.trim(),
      description: courseData.description.trim(),
      target_date: courseData.target_date,
      status: courseData.status,
      created_at: new Date().toISOString()
    };

    courses.push(newCourse);
    await writeCourses(courses);

    res.status(201).json({
      message: "Course created successfully",
      course: newCourse
    });
  } catch (error) {
    next(error);
  }
});

// GET - Get all courses
app.get("/api/courses", async (req, res, next) => {
  try {
    const courses = await readCourses();
    res.status(200).json(courses);
  } catch (error) {
    next(error);
  }
});

// GET - Get a specific course
app.get("/api/courses/:id", async (req, res, next) => {
  try {
    const courses = await readCourses();
    const course = findCourseById(courses, req.params.id);

    if (!course) {
      throw createError("Course not found", 404);
    }

    res.status(200).json(course);
  } catch (error) {
    next(error);
  }
});

// PUT - Update a course
app.put("/api/courses/:id", async (req, res, next) => {
  try {
    const validationErrors = validateCourseData({
  name: req.body.name ?? "Existing",
  description: req.body.description ?? "Existing",
  target_date: req.body.target_date ?? "2025-12-31",
  status: req.body.status ?? "Not Started"
});

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Course validation failed",
        details: validationErrors
      });
    }

    const courses = await readCourses();

    const courseIndex = courses.findIndex(
      (course) => course.id === Number(req.params.id)
    );

    if (courseIndex === -1) {
      throw createError("Course not found", 404);
    }

    const updatedCourse = {
  id: courses[courseIndex].id,
  name: req.body.name !== undefined
    ? req.body.name.trim()
    : courses[courseIndex].name,
  description: req.body.description !== undefined
    ? req.body.description.trim()
    : courses[courseIndex].description,
  target_date: req.body.target_date !== undefined
    ? req.body.target_date
    : courses[courseIndex].target_date,
  status: req.body.status !== undefined
    ? req.body.status
    : courses[courseIndex].status,
  created_at: courses[courseIndex].created_at
};
    courses[courseIndex] = updatedCourse;
    await writeCourses(courses);

    res.status(200).json({
      message: "Course updated successfully",
      course: updatedCourse
    });
  } catch (error) {
    next(error);
  }
});

// DELETE - Delete a course
app.delete("/api/courses/:id", async (req, res, next) => {
  try {
    const courses = await readCourses();

    const courseIndex = courses.findIndex(
      (course) => course.id === Number(req.params.id)
    );

    if (courseIndex === -1) {
      throw createError("Course not found", 404);
    }

    const deletedCourse = courses.splice(courseIndex, 1)[0];
    await writeCourses(courses);

    res.status(200).json({
      message: "Course deleted successfully",
      course: deletedCourse
    });
  } catch (error) {
    next(error);
  }
});

// Route not found
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// General error handler
app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.statusCode || 500).json({
    error: error.message || "An unexpected server error occurred"
  });
});

// Start server
async function startServer() {
  try {
    await ensureCoursesFile();

    app.listen(PORT, () => {
      console.log(`CodeCraftHub API running on port ${PORT}`);
      console.log(`Courses file: ${COURSES_FILE}`);
    });
  } catch (error) {
    console.error("Unable to start the server:", error.message);
    process.exit(1);
  }
}

startServer();