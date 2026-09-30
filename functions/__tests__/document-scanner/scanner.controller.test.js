const test = require("node:test");
const assert = require("node:assert/strict");
require("../helpers/quiet");

// Mock scanner.service before requiring the controller
let mockCreateScannerSessionHandler = async () => {};
let mockAddScannerPageHandler = async () => {};
let mockFinalizeScannerSessionHandler = async () => {};

const mockService = {
  createScannerSession: async (...args) => mockCreateScannerSessionHandler(...args),
  addScannerPage: async (...args) => mockAddScannerPageHandler(...args),
  finalizeScannerSession: async (...args) => mockFinalizeScannerSessionHandler(...args),
};

// Clear any existing cached modules
delete require.cache[require.resolve("../../src/document-scanner/scanner.service")];
delete require.cache[require.resolve("../../src/document-scanner/scanner.controller")];

require.cache[require.resolve("../../src/document-scanner/scanner.service")] = {
  exports: mockService,
};

const {
  postCreateSession,
  postAddPage,
  postFinalizeSession,
} = require("../../src/document-scanner/scanner.controller");

// Helper to create mock response object
function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
}

// Helper to construct multipart/form-data rawBody and headers
function buildMultipartBody({
  boundary = "----WebKitFormBoundaryTest123456",
  fields = {},
  file = null,
} = {}) {
  const crlf = "\r\n";
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null) {
      parts.push(
        Buffer.from(
          `--${boundary}${crlf}` +
          `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
          `${val}${crlf}`
        )
      );
    }
  }

  if (file) {
    const fieldName = file.fieldName || "file";
    const filename = file.filename || "test-image.jpg";
    const mimeType = file.mimeType || "image/jpeg";
    const fileHeader =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}` +
      `Content-Type: ${mimeType}${crlf}${crlf}`;
    parts.push(Buffer.from(fileHeader));
    parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || ""));
    parts.push(Buffer.from(crlf));
  }

  parts.push(Buffer.from(`--${boundary}--${crlf}`));

  const rawBody = Buffer.concat(parts);
  const headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(rawBody.length),
  };

  return { rawBody, headers };
}

// ==========================================
// postCreateSession Tests
// ==========================================

test("1. Successfully creates a scanner session and returns HTTP 201", async () => {
  let passedUserId = null;
  mockCreateScannerSessionHandler = async (userId) => {
    passedUserId = userId;
    return {
      sessionId: "session-abc-123",
      status: "created",
      pageCount: 0,
    };
  };

  const req = {
    user: { userId: "user-123" },
  };
  const res = createMockResponse();

  await postCreateSession(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(passedUserId, "user-123");
  assert.deepEqual(res.body, {
    sessionId: "session-abc-123",
    status: "created",
    pageCount: 0,
  });
});

test("2. Returns 401 when req.user is missing in postCreateSession", async () => {
  const reqNoUser = {};
  const res = createMockResponse();

  await postCreateSession(reqNoUser, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });

  const reqEmptyUser = { user: {} };
  const res2 = createMockResponse();

  await postCreateSession(reqEmptyUser, res2);

  assert.equal(res2.statusCode, 401);
  assert.deepEqual(res2.body, { error: "Unauthorized" });
});

test("3. Returns 500 when createScannerSession fails", async () => {
  mockCreateScannerSessionHandler = async () => {
    throw new Error("Firestore unavailable");
  };

  const req = {
    user: { id: "user-456" },
  };
  const res = createMockResponse();

  await postCreateSession(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Firestore unavailable" });
});

// ==========================================
// postAddPage Tests
// ==========================================

test("4. Successfully accepts a JPEG multipart upload and returns HTTP 200", async () => {
  let passedArgs = null;
  mockAddScannerPageHandler = async (userId, sessionId, pageNumber, fileBuffer, mimeType) => {
    passedArgs = { userId, sessionId, pageNumber, fileBuffer, mimeType };
    return {
      sessionId,
      pageNumber,
      pageId: "page-001",
      storagePath: `scanner/${sessionId}/page-001.jpg`,
      pageCount: 1,
      status: "uploaded",
    };
  };

  const imageBuffer = Buffer.from("fake-jpeg-image-binary-data");
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "image",
      filename: "page1.jpg",
      mimeType: "image/jpeg",
      content: imageBuffer,
    },
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-test-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(passedArgs.userId, "user-123");
  assert.equal(passedArgs.sessionId, "session-test-1");
  assert.equal(passedArgs.pageNumber, 1);
  assert.deepEqual(passedArgs.fileBuffer, imageBuffer);
  assert.equal(passedArgs.mimeType, "image/jpeg");
  assert.deepEqual(res.body, {
    sessionId: "session-test-1",
    pageNumber: 1,
    pageId: "page-001",
    storagePath: "scanner/session-test-1/page-001.jpg",
    pageCount: 1,
    status: "uploaded",
  });
});

test("5. Successfully accepts a PNG multipart upload and returns HTTP 200", async () => {
  let passedArgs = null;
  mockAddScannerPageHandler = async (userId, sessionId, pageNumber, fileBuffer, mimeType) => {
    passedArgs = { userId, sessionId, pageNumber, fileBuffer, mimeType };
    return {
      sessionId,
      pageNumber,
      pageId: "page-002",
      storagePath: `scanner/${sessionId}/page-002.png`,
      pageCount: 2,
      status: "uploaded",
    };
  };

  const pngBuffer = Buffer.from("fake-png-image-binary-data");
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "2" },
    file: {
      fieldName: "file",
      filename: "doc.png",
      mimeType: "image/png",
      content: pngBuffer,
    },
  });

  const req = {
    user: { id: "user-456" },
    params: { sessionId: "session-test-2" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(passedArgs.userId, "user-456");
  assert.equal(passedArgs.sessionId, "session-test-2");
  assert.equal(passedArgs.pageNumber, 2);
  assert.deepEqual(passedArgs.fileBuffer, pngBuffer);
  assert.equal(passedArgs.mimeType, "image/png");
  assert.deepEqual(res.body, {
    sessionId: "session-test-2",
    pageNumber: 2,
    pageId: "page-002",
    storagePath: "scanner/session-test-2/page-002.png",
    pageCount: 2,
    status: "uploaded",
  });
});

test("6. Returns 401 when req.user is missing in postAddPage", async () => {
  const req = {
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("7. Returns 400 when sessionId is missing", async () => {
  const req = {
    user: { userId: "user-123" },
    params: {},
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "sessionId is required" });
});

test("8. Returns 400 when no image is uploaded", async () => {
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: null,
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "No image file uploaded" });
});

test("9. Returns 400 for unsupported image MIME type", async () => {
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "file",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4..."),
    },
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Unsupported image type/);
});

test("10. Returns 400 when pageNumber is missing", async () => {
  const { rawBody, headers } = buildMultipartBody({
    fields: {},
    file: {
      fieldName: "file",
      filename: "page.jpg",
      mimeType: "image/jpeg",
      content: Buffer.from("image-bytes"),
    },
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "pageNumber is required" });
});

test("11. Returns 400 for invalid pageNumber", async () => {
  const invalidNumbers = ["0", "-5", "abc", "1.5"];

  for (const invalidPageNumber of invalidNumbers) {
    const { rawBody, headers } = buildMultipartBody({
      fields: { pageNumber: invalidPageNumber },
      file: {
        fieldName: "file",
        filename: "page.jpg",
        mimeType: "image/jpeg",
        content: Buffer.from("image-bytes"),
      },
    });

    const req = {
      user: { userId: "user-123" },
      params: { sessionId: "session-1" },
      headers,
      rawBody,
    };
    const res = createMockResponse();

    await postAddPage(req, res);

    assert.equal(res.statusCode, 400, `Expected 400 for pageNumber: ${invalidPageNumber}`);
    assert.deepEqual(res.body, { error: "pageNumber must be a positive integer" });
  }
});

test("12. Returns 413 when upload exceeds 10MB", async () => {
  const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x61);
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "file",
      filename: "large.jpg",
      mimeType: "image/jpeg",
      content: oversizedBuffer,
    },
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { error: "Photo too large (max 10MB)" });
});

test("13. Returns 403 when the service reports that the session belongs to another user", async () => {
  mockAddScannerPageHandler = async () => {
    throw new Error("Scanner session does not belong to this user");
  };

  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "file",
      filename: "page.jpg",
      mimeType: "image/jpeg",
      content: Buffer.from("valid-image-bytes"),
    },
  });

  const req = {
    user: { userId: "intruder-user" },
    params: { sessionId: "session-1" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Scanner session does not belong to this user" });
});

test("14. Returns 404 when the service reports that the session does not exist", async () => {
  mockAddScannerPageHandler = async () => {
    throw new Error("Scanner session not found");
  };

  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "file",
      filename: "page.jpg",
      mimeType: "image/jpeg",
      content: Buffer.from("valid-image-bytes"),
    },
  });

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "nonexistent-session" },
    headers,
    rawBody,
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Scanner session not found" });
});

// ==========================================
// postFinalizeSession Tests
// ==========================================

test("15. Successfully finalizes session and returns HTTP 200 with job details", async () => {
  let passedUserId = null;
  let passedSessionId = null;

  mockFinalizeScannerSessionHandler = async (userId, sessionId) => {
    passedUserId = userId;
    passedSessionId = sessionId;
    return {
      sessionId,
      jobId: "print-job-123",
      status: "completed",
      pageCount: 3,
      fileName: "scanned_document.pdf",
    };
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-abc" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(passedUserId, "user-123");
  assert.equal(passedSessionId, "session-abc");
  assert.deepEqual(res.body, {
    sessionId: "session-abc",
    jobId: "print-job-123",
    status: "completed",
    pageCount: 3,
    fileName: "scanned_document.pdf",
  });
});

test("16. Returns 401 when req.user is missing in postFinalizeSession", async () => {
  const req = {
    params: { sessionId: "session-abc" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("17. Returns 400 when sessionId is missing in postFinalizeSession", async () => {
  const req = {
    user: { userId: "user-123" },
    params: {},
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "sessionId is required" });
});

test("18. Returns 404 when session is not found in postFinalizeSession", async () => {
  mockFinalizeScannerSessionHandler = async () => {
    throw new Error("Scanner session not found");
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "ghost-session" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Scanner session not found" });
});

test("19. Returns 403 when session belongs to another user in postFinalizeSession", async () => {
  mockFinalizeScannerSessionHandler = async () => {
    throw new Error("Scanner session does not belong to this user");
  };

  const req = {
    user: { userId: "intruder" },
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Scanner session does not belong to this user" });
});

test("20. Returns 400 when session is already completed or not available in postFinalizeSession", async () => {
  mockFinalizeScannerSessionHandler = async () => {
    throw new Error("Scanner session is not available");
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Scanner session is not available" });
});

test("21. Returns 400 when session has no uploaded pages in postFinalizeSession", async () => {
  mockFinalizeScannerSessionHandler = async () => {
    throw new Error("Scanner session has no uploaded pages");
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Scanner session has no uploaded pages" });
});

test("22. Returns 500 when unexpected error occurs in postFinalizeSession", async () => {
  mockFinalizeScannerSessionHandler = async () => {
    throw new Error("GCS connection timeout");
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "GCS connection timeout" });
});
