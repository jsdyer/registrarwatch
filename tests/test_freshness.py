import json
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh

class FreshnessTests(unittest.TestCase):
    def test_unchanged_quarters_advance_check_and_failed_download_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=refresh.OUTPUT
            previous=json.loads((source/"index.json").read_text())
            docs={day:json.loads((source/(day+".json")).read_text()) for day in previous["quarters"]}
            links={doc["source"].removeprefix(refresh.SOURCE):day for day,doc in docs.items()}
            html="".join(f'<a href="{url}">CSV</a>' for url in links).encode()
            for day,doc in docs.items():(root/(day+".json")).write_text(json.dumps(doc))
            (root/"index.json").write_text(json.dumps(previous))
            with patch.object(refresh,"OUTPUT",root),patch.object(refresh,"read_url",return_value=html),patch.object(refresh,"retrieve",side_effect=lambda url:(links[url],docs[links[url]])):
                refresh.main()
            status=json.loads((root/"index.json").read_text())
            self.assertEqual(status["updated"],previous["updated"])
            self.assertIn("checked_at",status)
            before=(root/"index.json").read_bytes()
            with patch.object(refresh,"OUTPUT",root),patch.object(refresh,"read_url",side_effect=OSError("unavailable")):
                with self.assertRaises(OSError):refresh.main()
            self.assertEqual(before,(root/"index.json").read_bytes())
