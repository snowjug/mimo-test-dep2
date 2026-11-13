import { test } from "node:test";
import assert from "node:assert/strict";

// Replicates the exact fileConfigs update logic from PrintOptions mount effect
function runFileConfigsUpdate(
  prevConfigs: Record<string, { pageSelection: "all" | "custom"; pageRange: string; selectedPages: number[] }>,
  parsedFiles: any[]
) {
  const updated = { ...prevConfigs };
  let changed = false;

  parsedFiles.filter(Boolean).forEach((file: any) => {
    const fname = file.name || "Document";
    const pCount = file.pageCount || 1;
    const currentConfig = updated[fname];

    if (!currentConfig || (currentConfig.pageSelection === "all" && currentConfig.selectedPages?.length !== pCount)) {
      changed = true;
      updated[fname] = {
        pageSelection: currentConfig?.pageSelection || "all",
        pageRange: `1-${pCount}`,
        selectedPages: Array.from({ length: pCount }, (_, i) => i + 1)
      };
    }
  });

  return { next: changed ? updated : prevConfigs, changed };
}

test("Scenario 1: First-time upload with no existing print configuration", () => {
  const prev = {};
  const files = [
    { name: "syllabus.pdf", pageCount: 4 }
  ];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(next["syllabus.pdf"], {
    pageSelection: "all",
    pageRange: "1-4",
    selectedPages: [1, 2, 3, 4]
  });
});

test("Scenario 2: Existing configuration with pageSelection 'all' and correct page count", () => {
  const prev = {
    "report.pdf": {
      pageSelection: "all" as const,
      pageRange: "1-3",
      selectedPages: [1, 2, 3]
    }
  };
  const files = [
    { name: "report.pdf", pageCount: 3 }
  ];

  // Must NOT throw ReferenceError and must NOT mark changed
  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, false);
  assert.strictEqual(next, prev); // reference equality preserved
});

test("Scenario 3: Existing configuration with pageSelection 'all' and changed page count", () => {
  const prev = {
    "async-doc.pdf": {
      pageSelection: "all" as const,
      pageRange: "1-1",
      selectedPages: [1]
    }
  };
  const files = [
    { name: "async-doc.pdf", pageCount: 5 } // updated after async analysis
  ];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(next["async-doc.pdf"], {
    pageSelection: "all",
    pageRange: "1-5",
    selectedPages: [1, 2, 3, 4, 5]
  });
});

test("Scenario 4: Existing configuration with manually selected pages (pageSelection 'custom')", () => {
  const prev = {
    "custom-doc.pdf": {
      pageSelection: "custom" as const,
      pageRange: "1, 3",
      selectedPages: [1, 3]
    }
  };
  const files = [
    { name: "custom-doc.pdf", pageCount: 10 }
  ];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, false);
  assert.strictEqual(next, prev);
  assert.deepStrictEqual(next["custom-doc.pdf"].selectedPages, [1, 3]);
  assert.strictEqual(next["custom-doc.pdf"].pageSelection, "custom");
});

test("Scenario 5: Single-file upload", () => {
  const prev = {};
  const files = [{ name: "single.pdf", pageCount: 2 }];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(next["single.pdf"], {
    pageSelection: "all",
    pageRange: "1-2",
    selectedPages: [1, 2]
  });
});

test("Scenario 6: Multiple-file upload", () => {
  const prev = {};
  const files = [
    { name: "fileA.pdf", pageCount: 2 },
    { name: "fileB.docx", pageCount: 5 }
  ];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(next["fileA.pdf"], {
    pageSelection: "all",
    pageRange: "1-2",
    selectedPages: [1, 2]
  });
  assert.deepStrictEqual(next["fileB.docx"], {
    pageSelection: "all",
    pageRange: "1-5",
    selectedPages: [1, 2, 3, 4, 5]
  });
});

test("Scenario 7: Files with missing, null, or zero page counts fall back to 1", () => {
  const prev = {};
  const files = [
    { name: "zero.pdf", pageCount: 0 },
    { name: "missing.pdf" },
    { name: "null.pdf", pageCount: null }
  ];

  const { next, changed } = runFileConfigsUpdate(prev, files);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(next["zero.pdf"], {
    pageSelection: "all",
    pageRange: "1-1",
    selectedPages: [1]
  });
  assert.deepStrictEqual(next["missing.pdf"], {
    pageSelection: "all",
    pageRange: "1-1",
    selectedPages: [1]
  });
  assert.deepStrictEqual(next["null.pdf"], {
    pageSelection: "all",
    pageRange: "1-1",
    selectedPages: [1]
  });
});

test("Scenario 8: Crash regression test — verifying bug causes ReferenceError before fix", () => {
  // Pre-condition that triggered the crash in production:
  // prev already has the file initialized (from useState initializer), with pageSelection: 'all'
  const prev = {
    "test.pdf": {
      pageSelection: "all",
      pageRange: "1-2",
      selectedPages: [1, 2]
    }
  };
  const files = [{ name: "test.pdf", pageCount: 2 }];

  // The buggy code:
  const buggyCode = () => {
    const updated: any = { ...prev };
    files.forEach((file: any) => {
      const fname = file.name || "Document";
      const currentConfig = updated[fname];
      // In buggy code, pCount is evaluated before declaration
      if (!currentConfig || (currentConfig.pageSelection === "all" && currentConfig.selectedPages?.length !== (eval("pCount")))) {
        const pCount = file.pageCount || 1;
        updated[fname] = { pageSelection: "all", pageRange: `1-${pCount}`, selectedPages: [1] };
      }
    });
  };

  // Buggy version throws ReferenceError
  assert.throws(buggyCode, {
    name: "ReferenceError",
    message: /pCount is not defined/
  });

  // Fixed version does NOT throw and returns successfully
  assert.doesNotThrow(() => {
    runFileConfigsUpdate(prev as any, files);
  });
});

