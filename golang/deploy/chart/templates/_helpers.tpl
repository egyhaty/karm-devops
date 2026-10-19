{{- define "learning-lab.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "learning-lab.labels" -}}
app.kubernetes.io/name: {{ include "learning-lab.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}
{{- define "learning-lab.selectorLabels" -}}
app.kubernetes.io/name: {{ include "learning-lab.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
