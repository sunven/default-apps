"""Observe human-operated NSOpenPanel cycles; never selects or injects URLs."""
import datetime
import importlib.util
import json
import time

spec = importlib.util.spec_from_file_location("native", __file__.replace("observe-human-sequence.py", "check-native.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
phases = [("unknown", 0), ("first-app", 1), ("alias-app", 1), ("second-app", 2)]
output = m.ROOT / "human-sequence-observations.json"
observations = json.loads(output.read_text()) if output.exists() else []
phases = phases[len(observations):]
before = m.CONFIG.read_bytes()

for phase, expected_count in phases:
    opened = False
    states = []
    for attempt in range(2400):
        panel = m.panel("inspect")
        dom = m.js('return {file:document.querySelector(".manual-file")?.innerText, unresolved:document.querySelector(".manual-unresolved")?.innerText, picked:document.querySelector(".manual-picked")?.innerText, busy:document.body.innerText.includes("正在处理…")||document.body.innerText.includes("正在选择…"), saveDisabled:[...document.querySelectorAll("button")].find(x=>x.textContent==="保存手动关联")?.disabled}')
        if panel.get("found"):
            if not states or panel != states[-1]:
                states.append(panel)
            opened = True
        elif opened and not dom["busy"]:
            saved = m.config()
            if len(saved["applications"]) != expected_count:
                # A human may cancel/reopen while navigating. Preserve that
                # observation without promoting it to successful selection.
                m.dump("human-navigation-cancel.json", {"phase": phase, "nativePanels": states, "dom": dom, "saved": saved})
                opened = False
                states = []
                time.sleep(.2)
                continue
            if phase == "unknown":
                assert "selected.defaultappsunknown05" in dom["file"], dom
                assert dom["unresolved"] and dom["saveDisabled"], dom
                assert m.CONFIG.read_bytes() == before
            else:
                assert len(saved["applications"]) == expected_count, saved
                assert dom["picked"] and "尚未提出修改默认应用的请求。" in dom["picked"], dom
                if phase == "alias-app":
                    assert m.CONFIG.read_bytes() == before
            result = {"phase": phase, "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "nativePanels": states, "dom": dom, "saved": saved, "configBytesChanged": m.CONFIG.read_bytes() != before}
            observations.append(result)
            m.dump("human-sequence-observations.json", observations)
            m.capture("human-" + phase + "-native.png")
            before = m.CONFIG.read_bytes()
            print(json.dumps(result, ensure_ascii=False), flush=True)
            break
        time.sleep(.2)
    else:
        raise AssertionError("human phase timed out: " + phase)
print("All four human picker cycles observed", flush=True)
