"""Quarterly procedure suggestions, separate from manual score overrides."""
import re
from datetime import datetime, timezone
from .scoring import actors_for_state
from .store import quarter_key

INTENT_SIGNALS = [
    (r"\b(wip(?:e|er|ing)|destroy|destruct|sabotag|encrypt(?:ed|ion)?|ransom|disrupt|denial.of.service)\b", 5, "destructive or disruptive action"),
    (r"\b(exfiltrat|steal|theft|collect(?:ed|ion)?|credential|financial|payment|bank)\b", 4, "theft or collection objective"),
    (r"\b(government|energy|financial|healthcare|telecom|defen[cs]e|technology|sector)\b", 3, "sector-focused activity"),
    (r"\b(region|country|state|ministry|embassy|military)\b", 2, "regional or state-focused activity"),
]
CAPABILITY_SIGNALS = [
    (r"\b(zero.?day|0day|custom malware|custom tool|kernel|rootkit|bootkit|firmware|supply.chain|hypervisor)\b", 5, "advanced or custom capability"),
    (r"\b(credential dump|lateral movement|persistence|defen[cs]e evasion|command and control|c2|exploit|web shell|process injection)\b", 4, "multi-stage operational capability"),
    (r"\b(powershell|script|macro|phishing|scheduled task|remote service|living off the land|lolbin)\b", 3, "established operational tooling"),
    (r"\b(scan|discover|enumerat|download|execute|command)\b", 2, "basic executable capability"),
]


def generate(quarter, state, procedures, context=None):
    quarter_key(quarter)
    q, year = int(quarter[1]), int(quarter[3:])
    month = [11, 2, 5, 8][q - 1]
    start = datetime(year - (q == 1), month, 1, tzinfo=timezone.utc).timestamp() * 1000
    end = datetime(year, [2, 5, 8, 11][q - 1], 1, tzinfo=timezone.utc).timestamp() * 1000
    results = {}
    context = context or {}
    for actor in actors_for_state(state):
        names = {actor["name"].upper(), *(n.strip().upper() for n in actor.get("aliases", "").split(","))}
        evidence_procs = [p for p in procedures if p["actor"].upper() in names and p.get("date") is not None and start <= p["date"] < end]
        if not evidence_procs:
            continue
        intent, capability, novelty, evidence = 1, 1, -2, []
        for p in evidence_procs:
            text = " ".join(str(p.get(k, "")) for k in ["mitreId", "tacticName", "techniqueName", "procedure", "externalRef", "reportRefs"])
            signals = []
            for patterns, kind in [(INTENT_SIGNALS, "intent"), (CAPABILITY_SIGNALS, "capability")]:
                for pattern, score, label in patterns:
                    if re.search(pattern, text, re.I):
                        signals.append(label)
                        if kind == "intent":
                            intent = max(intent, score)
                        else:
                            capability = max(capability, score)
            if re.search(r"\b(zero.?day|0day|custom malware|custom tool|novel|previously unknown|bespoke)\b", text, re.I):
                novelty = 0
                signals.append("novel or custom tooling")
            elif not re.search(r"\b(mimikatz|cobalt strike|powershell|rclone|psexec|publicly available|open.source|commodity)\b", text, re.I):
                novelty = max(novelty, -1)
            else:
                signals.append("generally available tooling")
            if signals and len(evidence) < 5:
                evidence.append({"mitreId": p["mitreId"], "date": p["date"], "excerpt": p["procedure"][:220], "signals": signals})
        profile = " ".join([str(actor.get(k, "")) for k in ["countries", "industries", "malware", "description"]]).lower()
        text = " ".join(str(p) for p in evidence_procs).lower()
        matches = {key: [t for t in context.get(key, []) if t.lower() in profile or t.lower() in text]
                   for key in ["industries", "countries", "technologies"]}
        context_intent = min(2, bool(matches["industries"]) + bool(matches["countries"]))
        targeted = any(t.lower() in text for key in ["industries", "countries"] for t in matches[key])
        context_capability = min(2, int(bool(matches["technologies"])) + int(targeted))
        distinct = len({signal for e in evidence for signal in e["signals"]})
        confidence = "high" if len(evidence_procs) >= 5 and distinct >= 3 else "medium" if len(evidence_procs) >= 2 and distinct else "low"
        results[actor["name"]] = {
            "actorName": actor["name"], "quarter": quarter, "sourceQuarter": quarter, "status": "pending",
            "generatedAt": datetime.now(timezone.utc).isoformat(), "intentBaseScore": intent, "willingnessModifier": 0,
            "capabilityBaseScore": capability, "noveltyModifier": novelty,
            "intentFinalScore": max(1, min(5, intent + context_intent)),
            "capabilityFinalScore": max(1, min(5, capability + novelty + context_capability)),
            "confidence": confidence, "procedureCount": len(evidence_procs), "evidence": evidence,
            "scoringContext": context, "contextMatches": matches,
            "contextIntentModifier": context_intent, "contextCapabilityModifier": context_capability,
            "previousIntentScore": actor["intent"], "previousCapabilityScore": actor["capability"],
        }
    return results
