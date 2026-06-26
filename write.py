import json
import os
data={"status":"COMPLETE","session":"WFS-employee-comprehensive-explorer"}
p=".workflow/active/WFS-employee-comprehensive-explorer/.process/exploration-patterns.json"
os.makedirs(os.path.dirname(p),exist_ok=True)
open(p,"w").write(json.dumps(data))
