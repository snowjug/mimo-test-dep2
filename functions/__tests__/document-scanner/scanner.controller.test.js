const test = require("node:test");
const assert = require("node:assert/strict");
require("../helpers/quiet");

// Mock scanner.service before requiring the controller
let mockCreateScannerSessionHandler = async () => {};
let mockGetScannerSessionHandler = async () => {};
let mockAddScannerPageHandler = async () => {};
let mockDeleteScannerPageHandler = async () => {};
let mockReorderScannerPagesHandler = async () => {};
let mockUpdateScannerPageHandler = async () => {};
let mockFinalizeScannerSessionHandler = async () => {};

const mockService = {
  createScannerSession: async (...args) => mockCreateScannerSessionHandler(...args),
  getScannerSession: async (...args) => mockGetScannerSessionHandler(...args),
  addScannerPage: async (...args) => mockAddScannerPageHandler(...args),
  deleteScannerPage: async (...args) => mockDeleteScannerPageHandler(...args),
  reorderScannerPages: async (...args) => mockReorderScannerPagesHandler(...args),
  updateScannerPage: async (...args) => mockUpdateScannerPageHandler(...args),
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
  getSession,
  postAddPage,
  deletePage,
  postReorderPages,
  patchPage,
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
// getSession Tests
// ==========================================

test("4. Successfully gets scanner session info and pages", async () => {
  mockGetScannerSessionHandler = async (userId, sessionId) => {
    return {
      sessionId,
      status: "created",
      pageCount: 2,
      pages: [
        { pageId: "page-001", pageNumber: 1, contentType: "image/jpeg", storagePath: "path/1.jpg", rotation: 0 },
        { pageId: "page-002", pageNumber: 2, contentType: "image/png", storagePath: "path/2.png", rotation: 90 },
      ],
    };
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-123" },
  };
  const res = createMockResponse();

  await getSession(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessionId, "session-123");
  assert.equal(res.body.pages.length, 2);
});

test("5. getSession returns 401 for unauthenticated request", async () => {
  const req = { params: { sessionId: "s-1" } };
  const res = createMockResponse();
  await getSession(req, res);
  assert.equal(res.statusCode, 401);
});

test("6. getSession returns 404 when session not found", async () => {
  mockGetScannerSessionHandler = async () => {
    throw new Error("Scanner session not found");
  };
  const req = { user: { userId: "u-1" }, params: { sessionId: "s-1" } };
  const res = createMockResponse();
  await getSession(req, res);
  assert.equal(res.statusCode, 404);
});

test("7. getSession returns 403 when session belongs to another user", async () => {
  mockGetScannerSessionHandler = async () => {
    throw new Error("Scanner session does not belong to this user");
  };
  const req = { user: { userId: "intruder" }, params: { sessionId: "s-1" } };
  const res = createMockResponse();
  await getSession(req, res);
  assert.equal(res.statusCode, 403);
});

// ==========================================
// postAddPage Tests
// ==========================================

test("8. Successfully accepts a JPEG multipart upload and returns HTTP 200", async () => {
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

test("9. Successfully accepts a PNG multipart upload and returns HTTP 200", async () => {
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

test("10. Returns 401 when req.user is missing in postAddPage", async () => {
  const req = {
    params: { sessionId: "session-1" },
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("11. Returns 400 when sessionId is missing", async () => {
  const req = {
    user: { userId: "user-123" },
    params: {},
  };
  const res = createMockResponse();

  await postAddPage(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "sessionId is required" });
});

test("12. Returns 400 when no image is uploaded", async () => {
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

test("13. Returns 400 for unsupported image MIME type", async () => {
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

test("14. Returns 400 when pageNumber is missing", async () => {
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

test("15. Returns 400 for invalid pageNumber", async () => {
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

test("16. Returns 413 when upload exceeds 10MB", async () => {
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

test("17. Returns 403 when the service reports that the session belongs to another user", async () => {
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

test("18. Returns 404 when the service reports that the session does not exist", async () => {
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
// deletePage Tests
// ==========================================

test("19. deletePage successfully deletes page and returns 200", async () => {
  mockDeleteScannerPageHandler = async (userId, sessionId, pageId) => {
    return { sessionId, pageId, pageCount: 1, status: "deleted" };
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1", pageId: "page-001" },
  };
  const res = createMockResponse();

  await deletePage(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { sessionId: "session-1", pageId: "page-001", pageCount: 1, status: "deleted" });
});

test("20. deletePage returns 401 when unauthorized", async () => {
  const req = { params: { sessionId: "s-1", pageId: "p-1" } };
  const res = createMockResponse();
  await deletePage(req, res);
  assert.equal(res.statusCode, 401);
});

test("21. deletePage returns 404 when page or session not found", async () => {
  mockDeleteScannerPageHandler = async () => {
    throw new Error("Page not found in this session");
  };
  const req = { user: { userId: "u-1" }, params: { sessionId: "s-1", pageId: "p-999" } };
  const res = createMockResponse();
  await deletePage(req, res);
  assert.equal(res.statusCode, 404);
});

// ==========================================
// postReorderPages Tests
// ==========================================

test("22. postReorderPages successfully reorders pages and returns 200", async () => {
  mockReorderScannerPagesHandler = async (userId, sessionId, order) => {
    return { sessionId, order, pageCount: 2, status: "reordered" };
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    body: { order: ["page-002", "page-001"] },
  };
  const res = createMockResponse();

  await postReorderPages(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { sessionId: "session-1", order: ["page-002", "page-001"], pageCount: 2, status: "reordered" });
});

test("23. postReorderPages returns 400 when order is not an array", async () => {
  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1" },
    body: { order: "invalid" },
  };
  const res = createMockResponse();

  await postReorderPages(req, res);
  assert.equal(res.statusCode, 400);
});

// ==========================================
// patchPage Tests
// ==========================================

test("24. patchPage successfully updates rotation and returns 200", async () => {
  mockUpdateScannerPageHandler = async (userId, sessionId, pageId, updates) => {
    return { sessionId, pageId, rotation: updates.rotation, status: "updated" };
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1", pageId: "page-001" },
    body: { rotation: 90 },
  };
  const res = createMockResponse();

  await patchPage(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { sessionId: "session-1", pageId: "page-001", rotation: 90, status: "updated" });
});

test("25. patchPage returns 400 for invalid rotation value", async () => {
  mockUpdateScannerPageHandler = async () => {
    throw new Error("rotation must be one of: 0, 90, 180, 270");
  };

  const req = {
    user: { userId: "user-123" },
    params: { sessionId: "session-1", pageId: "page-001" },
    body: { rotation: 45 },
  };
  const res = createMockResponse();

  await patchPage(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /rotation must be one of/);
});

// ==========================================
// postFinalizeSession Tests
// ==========================================

test("26. Successfully finalizes session and returns HTTP 200 with job details", async () => {
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

test("27. Returns 401 when req.user is missing in postFinalizeSession", async () => {
  const req = {
    params: { sessionId: "session-abc" },
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("28. Returns 400 when sessionId is missing in postFinalizeSession", async () => {
  const req = {
    user: { userId: "user-123" },
    params: {},
  };
  const res = createMockResponse();

  await postFinalizeSession(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "sessionId is required" });
});

test("29. Returns 404 when session is not found in postFinalizeSession", async () => {
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

test("30. Returns 403 when session belongs to another user in postFinalizeSession", async () => {
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

test("31. Returns 400 when session is already completed or not available in postFinalizeSession", async () => {
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

test("32. Returns 400 when session has no uploaded pages in postFinalizeSession", async () => {
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

test("33. Returns 500 when unexpected error occurs in postFinalizeSession", async () => {
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

test("34. Regression: Successfully parses multipart upload via stream piping when req.rawBody is undefined", async () => {
  const { Readable } = require("stream");
  let passedArgs = null;
  mockAddScannerPageHandler = async (userId, sessionId, pageNumber, fileBuffer, mimeType) => {
    passedArgs = { userId, sessionId, pageNumber, fileBuffer, mimeType };
    return {
      sessionId,
      pageNumber,
      pageId: "page-stream-001",
      storagePath: `scanner/${sessionId}/page-stream-001.jpg`,
      pageCount: 1,
      status: "uploaded",
    };
  };

  const imageBuffer = Buffer.from("test-stream-binary-data");
  const { rawBody, headers } = buildMultipartBody({
    fields: { pageNumber: "1" },
    file: {
      fieldName: "page",
      filename: "page1.jpg",
      mimeType: "image/jpeg",
      content: imageBuffer,
    },
  });

  // Create stream mock without req.rawBody (simulating standard Express stream)
  const reqStream = Readable.from(rawBody);
  reqStream.headers = headers;
  reqStream.user = { userId: "user-stream-test" };
  reqStream.params = { sessionId: "session-stream-1" };
  // Explicitly ensure req.rawBody is undefined
  reqStream.rawBody = undefined;

  const res = createMockResponse();

  await postAddPage(reqStream, res);

  assert.equal(res.statusCode, 200);
  assert.equal(passedArgs.userId, "user-stream-test");
  assert.equal(passedArgs.sessionId, "session-stream-1");
  assert.equal(passedArgs.pageNumber, 1);
  assert.deepEqual(passedArgs.fileBuffer, imageBuffer);
  assert.equal(passedArgs.mimeType, "image/jpeg");
  assert.deepEqual(res.body, {
    sessionId: "session-stream-1",
    pageNumber: 1,
    pageId: "page-stream-001",
    storagePath: "scanner/session-stream-1/page-stream-001.jpg",
    pageCount: 1,
    status: "uploaded",
  });
});
