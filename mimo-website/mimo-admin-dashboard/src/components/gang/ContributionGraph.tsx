import React from 'react';

/** GitHub-style login-streak heatmap. `dates` is a sorted array of "YYYY-MM-DD" strings (days this person
 * logged in). Shows the trailing `weeks` weeks, newest on the right — same reading direction as GitHub's
 * own contribution graph, just scoped to the data we actually have (login activity, not commits). */
export const ContributionGraph: React.FC<{ dates: string[]; weeks?: number }> = ({ dates, weeks = 14 }) => {
  const dateSet = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start on the Sunday on/before (today - weeks*7 days), so the grid's columns are aligned calendar weeks.
  const totalDays = weeks * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1));
  start.setDate(start.getDate() - start.getDay());

  const columns: Date[][] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const col: Date[] = [];
    for (let d = 0; d < 7; d++) {
      col.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push(col);
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const currentStreak = (() => {
    let n = 0;
    const d = new Date(today);
    while (dateSet.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  })();

  return (
    <div className="inline-flex items-center gap-2" title={`${dates.length} login${dates.length === 1 ? '' : 's'} in the last ${weeks} weeks`}>
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d, di) => {
              const future = d > today;
              const active = !future && dateSet.has(iso(d));
              return (
                <div
                  key={di}
                  className={`size-[9px] rounded-[2px] ${
                    future ? 'bg-transparent' : active ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                  title={future ? undefined : `${iso(d)}${active ? ' · logged in' : ''}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      {currentStreak > 0 && (
        <span className="text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          {currentStreak}d streak
        </span>
      )}
    </div>
  );
};
