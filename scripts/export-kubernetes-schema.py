#!/usr/bin/env python3
"""Export the CRD definition omitted from the standard kubeconform registry."""
import json
import pathlib
import sys

source = json.loads(pathlib.Path(sys.argv[1]).read_text())
name = "io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition"
schema = dict(source["definitions"][name])
schema["definitions"] = source["definitions"]
destination = pathlib.Path(sys.argv[2]) / "apiextensions.k8s.io"
destination.mkdir(parents=True, exist_ok=True)
(destination / "customresourcedefinition_v1.json").write_text(json.dumps(schema))
