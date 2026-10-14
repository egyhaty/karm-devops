#!/usr/bin/env python3
"""Export kubeconform schemas from version-pinned upstream Helm CRDs."""
import json
import pathlib
import sys

import yaml


class KubernetesLoader(yaml.SafeLoader):
    """Accept literal '=' enum values in upstream Kubernetes schemas."""


KubernetesLoader.add_constructor(
    "tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node)
)

destination = pathlib.Path(sys.argv[1])
count = 0
for source in map(pathlib.Path, sys.argv[2:]):
    for document in yaml.load_all(source.read_text(), Loader=KubernetesLoader):
        if not document or document.get("kind") != "CustomResourceDefinition":
            continue
        spec = document["spec"]
        for version in spec["versions"]:
            schema = version.get("schema", {}).get("openAPIV3Schema")
            if not schema:
                continue
            target = destination / spec["group"]
            target.mkdir(parents=True, exist_ok=True)
            filename = f'{spec["names"]["kind"].lower()}_{version["name"]}.json'
            (target / filename).write_text(json.dumps(schema))
            count += 1
if not count:
    raise SystemExit("No upstream CRD schemas were exported")
print(f"Exported {count} upstream CRD schemas")
