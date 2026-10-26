from django import forms
from .scoring import EXTENT_FIELDS, LAST_OCC, CONFIDENCE

LEVELS = [(v, v) for v in ["Low", "Medium", "High"]]


class ActorForm(forms.Form):
    revision = forms.CharField(required=False, widget=forms.HiddenInput)
    name = forms.CharField(max_length=200)
    description = forms.CharField(required=False, widget=forms.Textarea)
    origins = forms.CharField(required=False)
    aliases = forms.CharField(required=False)
    actorType = forms.CharField(label="Actor type", required=False)
    malware = forms.CharField(label="Malware / tools", required=False)
    countries = forms.CharField(required=False, help_text="Comma-separated")
    industries = forms.CharField(required=False, help_text="Comma-separated")
    intentFinalScore = forms.IntegerField(label="Base intent score", min_value=0, max_value=7, required=False)
    capabilityFinalScore = forms.IntegerField(label="Capability score", min_value=0, max_value=7, required=False)
    intentBaseScore = forms.IntegerField(label="Intent rubric score", min_value=1, max_value=5, required=False)
    willingnessModifier = forms.IntegerField(label="Willingness modifier", min_value=-4, max_value=0, required=False)
    capabilityBaseScore = forms.IntegerField(label="Capability rubric score", min_value=1, max_value=5, required=False)
    noveltyModifier = forms.IntegerField(label="Novelty modifier", min_value=-2, max_value=0, required=False)
    intentRationale = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))
    willingnessRationale = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))
    capabilityRationale = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))
    noveltyRationale = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))
    inMonitoringList = forms.BooleanField(label="Monitor this actor in this quarter", required=False)

    def clean_name(self):
        return self.cleaned_data["name"].strip().upper()

    def clean(self):
        values = super().clean()
        for target, base, modifier in [("intentFinalScore", "intentBaseScore", "willingnessModifier"),
                                       ("capabilityFinalScore", "capabilityBaseScore", "noveltyModifier")]:
            if values.get(base) is not None:
                values[target] = max(1, min(5, values[base] + (values.get(modifier) or 0)))
        return values


class UserForm(forms.Form):
    email = forms.EmailField(label="Username (email address)")
    password = forms.CharField(min_length=15, widget=forms.PasswordInput, help_text="At least 15 characters. Share securely.")


class CredentialsForm(forms.Form):
    clientId = forms.CharField(label="CrowdStrike client ID", widget=forms.PasswordInput)
    clientSecret = forms.CharField(label="CrowdStrike client secret", widget=forms.PasswordInput)


class ConfirmForm(forms.Form):
    revision = forms.CharField(required=False, widget=forms.HiddenInput)
    confirm = forms.BooleanField(label="I confirm this change")


class ImpactForm(forms.Form):
    confidentiality = forms.ChoiceField(choices=LEVELS)
    integrity = forms.ChoiceField(choices=LEVELS)
    availability = forms.ChoiceField(choices=LEVELS)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in EXTENT_FIELDS:
            self.fields[field] = forms.FloatField(label=field, min_value=0, max_value=100)


class LikelihoodForm(forms.Form):
    lastOccurrence = forms.ChoiceField(label="Last occurrence", choices=[(v, v) for v in LAST_OCC])
    confidence = forms.ChoiceField(choices=[(v, v) for v in CONFIDENCE])


class TacticForm(forms.Form):
    conf = forms.ChoiceField(label="Confidentiality", choices=LEVELS)
    integrity = forms.ChoiceField(choices=LEVELS)
    avail = forms.ChoiceField(label="Availability", choices=LEVELS)
    extent = forms.FloatField(min_value=0, max_value=100)


class HVAForm(forms.Form):
    target = forms.CharField(label="Asset / target", max_length=300)
    tid = forms.RegexField(r"^T\d{4}(?:\.\d{3})?$", label="Technique ID")
    tidName = forms.CharField(label="Technique name", required=False)
    risk = forms.ChoiceField(choices=[(v, v) for v in ["Unknown", "Low", "Medium", "High", "Critical"]])
    likelihood = forms.ChoiceField(choices=[(v, v) for v in ["Unknown", "Low", "Medium", "High", "Very High"]])
    impact = forms.CharField(required=False, widget=forms.Textarea)
    riskScore = forms.FloatField(label="Risk score", min_value=0, max_value=100)
    likelihoodScore = forms.FloatField(label="Likelihood score", min_value=0, max_value=100)


class ProcedureForm(forms.Form):
    actor = forms.CharField(max_length=200)
    mitreId = forms.RegexField(r"^T\d{4}(?:\.\d{3})?$", label="Technique ID")
    procedure = forms.CharField(widget=forms.Textarea)
    date = forms.DateField(required=False, widget=forms.DateInput(attrs={"type": "date"}))
    externalRef = forms.CharField(label="Reference", required=False, widget=forms.Textarea(attrs={"rows": 2}))


class ImportForm(forms.Form):
    kind = forms.ChoiceField(choices=[("mitre", "MITRE ATT&CK STIX JSON"), ("actors", "Actor MITRE JSON"),
                                      ("reports", "CrowdStrike reports JSON"), ("procedures", "Procedures CSV / JSON"),
                                      ("hva", "High-value assets CSV / JSON"), ("settings", "Python workspace settings JSON")])
    label = forms.CharField(required=False, max_length=200)
    file = forms.FileField()

    def clean_file(self):
        upload = self.cleaned_data["file"]
        if upload.size > 35 * 1024 * 1024:
            raise forms.ValidationError("The upload must be smaller than 35 MB.")
        return upload


class AssessmentForm(forms.Form):
    revision = forms.CharField(required=False, widget=forms.HiddenInput)
    decision = forms.ChoiceField(choices=[("approved", "Approve suggestion"), ("rejected", "Reject suggestion")])


class ScoringContextForm(forms.Form):
    industries = forms.CharField(required=False, widget=forms.Textarea, help_text="One target industry per line")
    countries = forms.CharField(required=False, widget=forms.Textarea, help_text="One target country per line")
    technologies = forms.CharField(required=False, widget=forms.Textarea, help_text="One technology per line")
