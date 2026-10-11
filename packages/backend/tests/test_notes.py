import json

import pandas as pd
import pytest
from embedding_atlas.notes import NotesStore, mount_notes
from embedding_atlas.server import make_duckdb_connection
from fastapi import FastAPI
from fastapi.testclient import TestClient

EMPTY = {"starred": False, "status": None, "comment": None, "labels": []}


def make_store(tmp_path):
    store = NotesStore(tmp_path / "notes.json", "imdb_id")
    df = store.apply(pd.DataFrame({"imdb_id": ["tt1", "tt2"], "x": [1.0, 2.0]}))
    return store, df


def test_columns_have_stable_types(tmp_path):
    _, df = make_store(tmp_path)
    con = make_duckdb_connection(df)
    types = dict(
        con.sql("SELECT column_name, column_type FROM (DESCRIBE dataset)").fetchall()
    )
    assert types["starred"] == "BOOLEAN"
    assert types["status"] == "VARCHAR"
    assert types["comment"] == "VARCHAR"
    assert types["labels"] == "VARCHAR[]"
    con.sql(
        "UPDATE dataset SET labels = ['a']::VARCHAR[], status = 'skip' WHERE imdb_id = 'tt1'"
    )


def test_put_persists_and_reloads(tmp_path):
    store, _ = make_store(tmp_path)
    saved = store.put(
        "tt1",
        {
            **EMPTY,
            "starred": True,
            "status": "watched",
            "comment": "",
            "labels": ["b", " a", ""],
        },
    )
    assert saved == {
        "starred": True,
        "status": "watched",
        "comment": None,
        "labels": ["a", "b"],
    }
    reloaded = NotesStore(tmp_path / "notes.json", "imdb_id")
    df = reloaded.apply(pd.DataFrame({"imdb_id": ["tt1", "tt2"]}))
    assert df.loc[0, "starred"] and df.loc[0, "status"] == "watched"
    assert not df.loc[1, "starred"] and list(df.loc[1, "labels"]) == []


def test_empty_note_is_removed(tmp_path):
    store, _ = make_store(tmp_path)
    store.put("tt1", {**EMPTY, "starred": True})
    store.put("tt1", EMPTY)
    assert json.loads((tmp_path / "notes.json").read_text()) == {}


@pytest.mark.parametrize(
    "patch",
    [
        {"starred": True},
        {**EMPTY, "status": "hidden"},
        {**EMPTY, "starred": 1},
        {**EMPTY, "labels": "a"},
        {**EMPTY, "extra": 1},
    ],
)
def test_invalid_patch(tmp_path, patch):
    store, _ = make_store(tmp_path)
    with pytest.raises(ValueError):
        store.put("tt1", patch)


def test_endpoints(tmp_path):
    store, df = make_store(tmp_path)
    connection = make_duckdb_connection(df)
    app = FastAPI()
    mount_notes(app, store, connection)
    client = TestClient(app)
    assert (
        client.put("/data/notes/tt1", json={**EMPTY, "starred": True}).status_code
        == 200
    )
    assert client.put("/data/notes/tt9", json=EMPTY).status_code == 404
    assert client.put("/data/notes/tt1", json={"starred": True}).status_code == 400
    assert client.get("/data/notes").json()["notes"]["tt1"]["starred"] is True
    rows = connection.sql(
        "SELECT imdb_id, starred FROM dataset ORDER BY imdb_id"
    ).fetchall()
    assert rows == [("tt1", True), ("tt2", False)]


def test_key_column_must_exist(tmp_path):
    with pytest.raises(ValueError):
        NotesStore(tmp_path / "notes.json", "missing").apply(
            pd.DataFrame({"imdb_id": ["tt1"]})
        )
