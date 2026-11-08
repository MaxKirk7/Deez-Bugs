"""Start the backend.  Run:  uv run runserver   (or:  uv run runserver 8001)"""

import sys

import uvicorn


def main() -> None:
    arg = sys.argv[1] if len(sys.argv) > 1 else "8000"
    if not arg.isdigit():
        print(__doc__)
        return
    port = int(arg)
    print(f"Backend on http://localhost:{port}  (API docs: http://localhost:{port}/docs)  Ctrl+C to stop")
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
