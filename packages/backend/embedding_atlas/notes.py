import json
import os
import tempfile
from pathlib import Path

import duckdb
import pandas as pd
import pyarrow as pa
from fastapi import FastAPI, HTTPException, Request

STATUSES = {"watched", "skip"}

COLUMNS = {
    "starred": pa.bool_(),
    "status": pa.string(),
    "comment": pa.string(),
    "labels": pa.list_(pa.string()),
}


def _validate(patch: dict) -> dict:
    unknown = set(patch) - set(COLUMNS)
    if unknown:
        raise ValueError(f"unknown fields: {sorted(unknown)}")
    missing = set(COLUMNS) - set(patch)
    if missing:
        raise ValueError(f"missing fields: {sorted(missing)}")
    if not isinstance(patch["starred"], bool):
        raise ValueError("starred must be a boolean")
    if patch["status"] is not None and patch["status"] not in STATUSES:
        raise ValueError(f"status must be null or one of {sorted(STATUSES)}")
    if patch["comment"] is not None and not isinstance(patch["comment"], str):
        raise ValueError("comment must be null or a string")
    labels = patch["labels"]
    if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
        raise ValueError("labels must be a list of strings")
    return {
        "starred": patch["starred"],
        "status": patch["status"],
        "comment": patch["comment"] or None,
        "labels": sorted({x.strip() for x in labels if x.strip()}),
    }


def _is_empty(note: dict) -> bool:
    return (
        not note["starred"]
        and note["status"] is None
        and note["comment"] is None
        and not note["labels"]
    )


class NotesStore:
    def __init__(self, path: str, key: str):
        self.path = Path(path)
        self.key = key
        self.notes: dict[str, dict] = (
            json.loads(self.path.read_text()) if self.path.exists() else {}
        )
        self.keys: set[str] = set()

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.key not in df.columns:
            raise ValueError(f"notes key column {self.key!r} is not in the dataset")
        clash = [c for c in COLUMNS if c in df.columns]
        if clash:
            raise ValueError(f"dataset already has note columns: {clash}")
        keys = df[self.key].astype(str)
        self.keys = set(keys)
        notes = [self.notes.get(k) for k in keys]
        for name, dtype in COLUMNS.items():
            if name == "starred":
                values = [bool(n and n["starred"]) for n in notes]
            elif name == "labels":
                values = [n["labels"] if n else [] for n in notes]
            else:
                values = [n[name] if n else None for n in notes]
            df[name] = pd.Series(
                pa.array(values, type=dtype), dtype=pd.ArrowDtype(dtype), index=df.index
            )
        return df

    def put(self, key: str, patch: dict) -> dict:
        if key not in self.keys:
            raise KeyError(key)
        note = _validate(patch)
        if _is_empty(note):
            self.notes.pop(key, None)
        else:
            self.notes[key] = note
        self._save()
        return note

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(self.notes, f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)


def mount_notes(app: FastAPI, store: NotesStore, connection: duckdb.DuckDBPyConnection):
    key_column = '"' + store.key.replace('"', '""') + '"'

    @app.get("/data/notes")
    async def get_notes():
        return {"key": store.key, "notes": store.notes}

    @app.put("/data/notes/{key}")
    async def put_note(key: str, req: Request):
        try:
            note = store.put(key, await req.json())
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"no row with {store.key}={key}"
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE dataset SET starred = ?, status = ?, comment = ?, labels = ?"
                f" WHERE CAST({key_column} AS VARCHAR) = ?",
                [note["starred"], note["status"], note["comment"], note["labels"], key],
            )
        return note
