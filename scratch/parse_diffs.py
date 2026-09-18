import json

with open("scratch/pi_diff_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

with open("scratch/pi_diff_report.txt", "w", encoding="utf-8") as out:
    for key, val in data.items():
        out.write(f"\n==================== {key} ====================\n")
        out.write(val.get("stdout", ""))
        if val.get("stderr"):
            out.write("\n[STDERR]:\n" + val.get("stderr"))
        out.write("\n")

print("Wrote diff report to scratch/pi_diff_report.txt")
