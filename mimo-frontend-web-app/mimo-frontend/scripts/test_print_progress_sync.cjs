/**
 * Comprehensive Test Suite for MIMO 1.0 Real-Time Paper Status Synchronization & Smooth Animation
 *
 * Covers:
 * 1. Single-paper jobs: starts at 1% when actively printing, advances smoothly without premature 100%, reaches 100% on confirmed completion.
 * 2. Multi-paper jobs: advances smoothly between confirmed sheet milestones, capped below next unconfirmed milestone.
 * 3. In-flight ceiling capping: progress never exceeds unconfirmed milestone ceiling or reaches 100% prematurely.
 * 4. Final completion: prompt transition to 100% and 'Print Completed ✅' when physical completion is confirmed.
 * 5. Duplicate polling responses: no drift or double-counting.
 * 6. Out-of-order / stale responses: strictly monotonic, no regression or corruption.
 * 7. Failed / refunded jobs: surfaces error without completing or showing 100%.
 * 8. Retry / new job: clean state reset, previous job does not contaminate new job.
 * 9. Duplex sheet calculation: calculates total sheets accurately and bounds milestones.
 * 10. stepVisualProgress: tests pure visual stepping and boundary enforcement.
 */

const assert = require('assert');

async function runTests() {
  console.log('================================================================');
  console.log('  MIMO 1.0 PAPER STATUS SYNCHRONIZATION & SMOOTH ANIMATION TESTS');
  console.log('================================================================\n');

  // Dynamically import pure functions and helpers from printProgress.ts
  const {
    calculatePrintProgress,
    calculateMilestoneBounds,
    stepVisualProgress,
    getVisualTickDelay,
  } = await import('../src/utils/printProgress.ts');

  // --------------------------------------------------------------------------
  // TEST 1: Single-paper job — starts at 1%, animates smoothly, strictly < 100% until confirmed
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Single-Paper Job: Starts at 1%, advances smoothly, capped at 90%, reaches 100% only on completion ---');
  {
    let currentProg = 0;
    let currentSheets = 0;

    // 1a. Paid / queue wait
    const resPaid = calculatePrintProgress({
      status: 'paid',
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets: 1,
      previousProgress: currentProg,
      previousSheetsCompleted: currentSheets,
      pages: 1,
      copies: 1,
    });
    assert.strictEqual(resPaid.progress, 0);
    assert.strictEqual(resPaid.statusMsg, 'Warming up printer…');
    assert.strictEqual(resPaid.isCompleted, false);
    assert.strictEqual(resPaid.isPrinting, false);

    // 1b. Actively printing begins -> starts at 1%
    const resPrinting = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets: 1,
      previousProgress: resPaid.progress,
      previousSheetsCompleted: resPaid.sheetsCompleted,
      pages: 1,
      copies: 1,
    });
    assert.strictEqual(resPrinting.progress, 1, 'Single-page job must start at 1% once actively printing');
    assert.strictEqual(resPrinting.milestoneFloor, 1);
    assert.strictEqual(resPrinting.milestoneCeiling, 90);
    assert.strictEqual(resPrinting.statusMsg, 'Printing document…');
    assert.strictEqual(resPrinting.isCompleted, false);
    assert.strictEqual(resPrinting.isPrinting, true);

    // 1c. Smooth presentation stepping within [1, 90] bounds
    let animatedProg = resPrinting.progress;
    const bounds = { floor: resPrinting.milestoneFloor, ceiling: resPrinting.milestoneCeiling };
    for (let step = 0; step < 120; step++) {
      animatedProg = stepVisualProgress(animatedProg, bounds);
    }
    assert.strictEqual(animatedProg, 90, 'Must cap strictly at 90% and never reach 100% while printing');

    // 1d. Completed state from physical confirmation
    const resCompleted = calculatePrintProgress({
      status: 'completed',
      isPrinted: true,
      sheetsCompleted: 1,
      totalSheets: 1,
      previousProgress: animatedProg,
      previousSheetsCompleted: resPrinting.sheetsCompleted,
      pages: 1,
      copies: 1,
    });
    assert.strictEqual(resCompleted.progress, 100);
    assert.strictEqual(resCompleted.statusMsg, 'Print Completed ✅');
    assert.strictEqual(resCompleted.isCompleted, true);
    console.log('✅ Passed: Single-paper job smooth progress and verified completion.');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Multi-paper job — advances smoothly between confirmed sheet milestones
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Multi-Paper Job: Advances smoothly between confirmed milestones ---');
  {
    const totalSheets = 4;
    let prog = 0;
    let sheets = 0;

    // 2a. Initial printing state (0 sheets confirmed)
    const res0 = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets,
      previousProgress: prog,
      previousSheetsCompleted: sheets,
      pages: 4,
    });
    assert.strictEqual(res0.progress, 1, 'Should start at 1% for active visual responsiveness');
    assert.strictEqual(res0.milestoneFloor, 1);
    // Ceiling for k=0 with N=4 is Math.round((0.85/4)*95) = 20%
    assert.strictEqual(res0.milestoneCeiling, 20);
    assert.strictEqual(res0.statusMsg, 'Warming up printer…');

    // Animate smoothly towards ceiling
    prog = res0.progress;
    for (let i = 0; i < 30; i++) {
      prog = stepVisualProgress(prog, { floor: res0.milestoneFloor, ceiling: res0.milestoneCeiling });
    }
    assert.strictEqual(prog, 20, 'Should cap at unconfirmed ceiling 20%');

    // 2b. Sheet 1 confirmed -> Floor: Math.round((1/4)*95) = 24%, Ceiling: Math.round(((1+0.85)/4)*95) = 44%
    const res1 = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 1,
      totalSheets,
      previousProgress: prog,
      previousSheetsCompleted: 0,
      pages: 4,
    });
    assert.strictEqual(res1.milestoneFloor, 24);
    assert.strictEqual(res1.milestoneCeiling, 44);
    assert.strictEqual(res1.progress, 24, 'Progress should jump to at least floor 24%');
    assert.strictEqual(res1.statusMsg, 'Printing sheet 1 of 4…');

    // Animate smoothly towards sheet 1 ceiling (44%)
    prog = res1.progress;
    for (let i = 0; i < 30; i++) {
      prog = stepVisualProgress(prog, { floor: res1.milestoneFloor, ceiling: res1.milestoneCeiling });
    }
    assert.strictEqual(prog, 44, 'Should cap at sheet 1 ceiling 44%');

    // 2c. Sheet 2 confirmed -> Floor: 48%, Ceiling: 68%
    const res2 = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 2,
      totalSheets,
      previousProgress: prog,
      previousSheetsCompleted: 1,
      pages: 4,
    });
    assert.strictEqual(res2.milestoneFloor, 48);
    assert.strictEqual(res2.milestoneCeiling, 68);
    assert.strictEqual(res2.progress, 48);
    assert.strictEqual(res2.statusMsg, 'Printing sheet 2 of 4…');

    // 2d. Sheet 3 confirmed -> Floor: 71%, Ceiling: 91%
    const res3 = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 3,
      totalSheets,
      previousProgress: res2.progress,
      previousSheetsCompleted: 2,
      pages: 4,
    });
    assert.strictEqual(res3.milestoneFloor, 71);
    assert.strictEqual(res3.milestoneCeiling, 91);
    assert.strictEqual(res3.progress, 71);
    assert.strictEqual(res3.statusMsg, 'Printing sheet 3 of 4…');

    // 2e. Final completion (Sheet 4 confirmed and job finished)
    const resComp = calculatePrintProgress({
      status: 'completed',
      isPrinted: true,
      sheetsCompleted: 4,
      totalSheets,
      previousProgress: res3.progress,
      previousSheetsCompleted: 3,
      pages: 4,
    });
    assert.strictEqual(resComp.progress, 100);
    assert.strictEqual(resComp.statusMsg, 'Print Completed ✅');
    assert.strictEqual(resComp.isCompleted, true);
    console.log('✅ Passed: Multi-paper job smooth progression and milestone bounding.');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Milestone bounds calculation helper
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: calculateMilestoneBounds Pure Function ---');
  {
    // Single sheet
    const b1 = calculateMilestoneBounds(0, 1);
    assert.deepStrictEqual(b1, { floor: 1, ceiling: 90 });

    // Multi-sheet: 2 sheets
    const b2_0 = calculateMilestoneBounds(0, 2);
    assert.strictEqual(b2_0.floor, 1);
    assert.strictEqual(b2_0.ceiling, 40); // round((0.85/2)*95) = 40

    const b2_1 = calculateMilestoneBounds(1, 2);
    assert.strictEqual(b2_1.floor, 48); // round((1/2)*95) = 48
    assert.strictEqual(b2_1.ceiling, 88); // round(((1+0.85)/2)*95) = 88

    console.log('✅ Passed: calculateMilestoneBounds produces accurate bounds.');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Duplicate polling responses — no duplicate counting or drift
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Duplicate Events & Repeated Polling ---');
  {
    const totalSheets = 5;
    let prog = 0;
    let sheets = 0;

    // Sheet 2 confirmed
    const resA = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 2,
      totalSheets,
      previousProgress: prog,
      previousSheetsCompleted: sheets,
      pages: 5,
    });
    prog = resA.progress;
    sheets = resA.sheetsCompleted;
    assert.strictEqual(prog, 38); // Math.round((2/5) * 95) = 38%

    // 10 subsequent identical poll responses with sheetsCompleted: 2
    for (let i = 0; i < 10; i++) {
      const resDup = calculatePrintProgress({
        status: 'printing',
        isPrinted: false,
        sheetsCompleted: 2,
        totalSheets,
        previousProgress: prog,
        previousSheetsCompleted: sheets,
        pages: 5,
      });
      assert.strictEqual(resDup.progress, 38);
      assert.strictEqual(resDup.sheetsCompleted, 2);
      assert.strictEqual(resDup.statusMsg, 'Printing sheet 2 of 5…');
    }
    console.log('✅ Passed: Repeated identical polls cause zero drift or double-counting.');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Out-of-order or stale responses — monotonic protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Out-of-Order / Stale Response Protection ---');
  {
    const totalSheets = 4;
    // Assume we already processed sheet 3 (71% progress)
    const previousProg = 75; // stepped up during animation
    const previousSheets = 3;

    // A stale delayed response arrives with sheetsCompleted: 1
    const resStale = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 1, // Stale!
      totalSheets,
      previousProgress: previousProg,
      previousSheetsCompleted: previousSheets,
      pages: 4,
    });

    assert.strictEqual(resStale.progress, 75, 'Progress must not regress backwards');
    assert.strictEqual(resStale.sheetsCompleted, 3, 'Sheets completed must not regress');
    assert.strictEqual(resStale.statusMsg, 'Printing sheet 3 of 4…');
    console.log('✅ Passed: Stale responses safely ignored without state regression.');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Failed / refunded jobs — error surfaced, no 100% completion
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Failed / Refunded Job Handling ---');
  {
    const resFail = calculatePrintProgress({
      status: 'failed',
      isPrinted: false,
      sheetsCompleted: 1,
      totalSheets: 3,
      previousProgress: 32,
      previousSheetsCompleted: 1,
      errorMsg: 'Paper Jam in Tray 1',
    });

    assert.strictEqual(resFail.isFailed, true);
    assert.strictEqual(resFail.isCompleted, false);
    assert.strictEqual(resFail.progress, 32);
    assert.strictEqual(resFail.statusMsg, 'Paper Jam in Tray 1');
    assert.strictEqual(resFail.errorMessage, 'Paper Jam in Tray 1');

    const resRefund = calculatePrintProgress({
      status: 'refunded',
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets: 2,
      previousProgress: 0,
      previousSheetsCompleted: 0,
      errorMsg: 'Print refunded due to timeout',
    });

    assert.strictEqual(resRefund.isFailed, true);
    assert.strictEqual(resRefund.isCompleted, false);
    assert.strictEqual(resRefund.statusMsg, 'Print refunded due to timeout');
    console.log('✅ Passed: Failures and refunds handled without false completion.');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Retry / new job — clean state reset
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Retry / New Job Isolation ---');
  {
    // New job starts with fresh state (0 progress, 0 sheets)
    const resNewJob = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets: 2,
      previousProgress: 0,
      previousSheetsCompleted: 0,
      pages: 2,
    });

    assert.strictEqual(resNewJob.progress, 1);
    assert.strictEqual(resNewJob.sheetsCompleted, 0);
    assert.strictEqual(resNewJob.statusMsg, 'Warming up printer…');
    console.log('✅ Passed: New job starts cleanly isolated from prior jobs.');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Duplex sheet calculation integration
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Duplex Sheet Calculation Support ---');
  {
    // 3 pages duplex = 2 sheets total.
    // When sheetsCompleted: 1 -> 1/2 * 95 = 48%
    const resDuplex = calculatePrintProgress({
      status: 'printing',
      isPrinted: false,
      sheetsCompleted: 1,
      totalSheets: 2,
      previousProgress: 0,
      previousSheetsCompleted: 0,
      pages: 3,
      copies: 1,
      doubleSided: true,
    });

    assert.strictEqual(resDuplex.totalSheets, 2);
    assert.strictEqual(resDuplex.progress, 48);
    assert.strictEqual(resDuplex.statusMsg, 'Printing sheet 1 of 2…');
    console.log('✅ Passed: Duplex sheet calculations verified.');
  }

  // --------------------------------------------------------------------------
  // TEST 9: stepVisualProgress boundary test
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: stepVisualProgress Boundary and Step Function ---');
  {
    const bounds = { floor: 24, ceiling: 44 };

    // Below floor -> jumps to floor
    assert.strictEqual(stepVisualProgress(10, bounds), 24);

    // Between floor and ceiling -> increments by step
    assert.strictEqual(stepVisualProgress(24, bounds), 25);
    assert.strictEqual(stepVisualProgress(24, bounds, false, false, 5), 29);

    // At or near ceiling -> clamped to ceiling
    assert.strictEqual(stepVisualProgress(43, bounds, false, false, 5), 44);
    assert.strictEqual(stepVisualProgress(44, bounds), 44);

    // Completed -> returns 100
    assert.strictEqual(stepVisualProgress(44, bounds, true), 100);

    // Failed -> preserves progress without change
    assert.strictEqual(stepVisualProgress(35, bounds, false, true), 35);

    console.log('✅ Passed: stepVisualProgress boundary test.');
  }

  // --------------------------------------------------------------------------
  // TEST 10: Transient 'paid' polling response while in flight does not freeze progress
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Transient paid polling response preserves in-flight bounds ---');
  {
    // A single sheet job is in flight at 25%
    const resTransientPaid = calculatePrintProgress({
      status: 'paid', // e.g. from delayed read replica
      isPrinted: false,
      sheetsCompleted: 0,
      totalSheets: 1,
      previousProgress: 25,
      previousSheetsCompleted: 0,
      pages: 1,
      copies: 1,
    });

    assert.strictEqual(resTransientPaid.progress, 25, 'Progress must not regress to 0% on transient paid response');
    assert.strictEqual(resTransientPaid.isPrinting, true, 'Job in flight must remain isPrinting: true');
    assert.strictEqual(resTransientPaid.milestoneCeiling, 90, 'Ceiling must remain 90% and not freeze to 0');
    assert.strictEqual(resTransientPaid.isCompleted, false);
    console.log('✅ Passed: Transient paid polling response preserved in-flight bounds without freezing.');
  }

  // --------------------------------------------------------------------------
  // TEST 11: getVisualTickDelay Adaptive Velocities for B&W Laser vs Color Inkjet
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: getVisualTickDelay Adaptive Print Velocity ---');
  {
    // B&W Laser: 40ms (<70%), 60ms (<85%), 100ms (<90%)
    assert.strictEqual(getVisualTickDelay(1, 'bw'), 40, 'B&W early progress must tick at 40ms');
    assert.strictEqual(getVisualTickDelay(50, 'bw'), 40, 'B&W mid progress must tick at 40ms');
    assert.strictEqual(getVisualTickDelay(70, 'bw'), 60, 'B&W late progress must tick at 60ms');
    assert.strictEqual(getVisualTickDelay(84, 'bw'), 60, 'B&W late progress must tick at 60ms');
    assert.strictEqual(getVisualTickDelay(85, 'bw'), 100, 'B&W exit ease must tick at 100ms');

    // Color Inkjet: 200ms
    assert.strictEqual(getVisualTickDelay(1, 'color'), 200, 'Color early progress must tick at 200ms');
    assert.strictEqual(getVisualTickDelay(50, 'color'), 200, 'Color mid progress must tick at 200ms');
    console.log('✅ Passed: getVisualTickDelay produces calibrated velocities for laser and inkjet.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PAPER STATUS & SMOOTH ANIMATION TESTS PASSED (11/11)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
