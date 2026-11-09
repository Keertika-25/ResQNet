"""Transparent rule-based priority classification.

PROTOTYPE AID ONLY - this is NOT a medical triage system. A dispatcher must review
and may override every suggestion.

score = severity points + incident-type points + people-affected points + keyword points
  Critical >= 9, High >= 6, Medium >= 3, otherwise Low
"""
SEVERITY_POINTS = {"Minor": 0, "Moderate": 2, "Serious": 4, "Life-threatening": 6}
TYPE_POINTS = {"Building Collapse": 3, "Fire": 2, "Medical Emergency": 1, "Road Accident": 1, "Flooding": 1, "Other": 0}
KEYWORDS = ("unconscious", "not breathing", "trapped", "bleeding", "explosion", "cardiac", "chest pain",
            "child", "spreading", "collapsed", "drowning", "burn")
THRESHOLDS = (("Critical", 9), ("High", 6), ("Medium", 3))
RULES_TEXT = {
    "severity": SEVERITY_POINTS,
    "type": TYPE_POINTS,
    "people_affected": {">= 10": 3, "3-9": 2, "2": 1, "1": 0},
    "keywords": {"any of": list(KEYWORDS), "points": 2},
    "thresholds": dict(THRESHOLDS) | {"Low": 0},
}


def classify(incident_type: str, severity: str, people_affected: int, description: str) -> tuple[str, int, str]:
    """Return (priority, score, human-readable explanation)."""
    reasons = []
    s = SEVERITY_POINTS.get(severity, 0)
    reasons.append(f"severity '{severity}' +{s}")
    t = TYPE_POINTS.get(incident_type, 0)
    reasons.append(f"type '{incident_type}' +{t}")
    p = 3 if people_affected >= 10 else 2 if people_affected >= 3 else 1 if people_affected == 2 else 0
    reasons.append(f"{people_affected} people affected +{p}")
    text = description.lower()
    hits = [k for k in KEYWORDS if k in text]
    k = 2 if hits else 0
    if hits:
        reasons.append(f"keywords ({', '.join(hits)}) +{k}")
    score = s + t + p + k
    priority = next((name for name, min_score in THRESHOLDS if score >= min_score), "Low")
    return priority, score, f"Score {score} → {priority}: " + "; ".join(reasons)


if __name__ == "__main__":
    assert classify("Fire", "Life-threatening", 4, "people trapped on 3rd floor")[0] == "Critical"
    assert classify("Other", "Minor", 1, "fallen branch on footpath")[0] == "Low"
    assert classify("Road Accident", "Serious", 2, "two cars collided")[0] == "High"  # 4+1+1 = 6
    assert classify("Flooding", "Moderate", 1, "water logging")[0] == "Medium"  # 2+1 = 3
    print("classify ok")
