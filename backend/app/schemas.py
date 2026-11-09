"""Request validation and response shapes. Passwords never appear in any *Out model."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

IncidentType = Literal["Road Accident", "Medical Emergency", "Fire", "Building Collapse", "Flooding", "Other"]
Severity = Literal["Minor", "Moderate", "Serious", "Life-threatening"]
Priority = Literal["Low", "Medium", "High", "Critical"]
EdStatus = Literal["Open", "Limited", "Diverting", "Closed"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not (any(c.isdigit() for c in v) and any(c.isalpha() for c in v)):
            raise ValueError("Password must contain letters and numbers")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: int
    name: str
    email: str
    phone: str
    role: str
    team_id: int | None
    hospital_id: int | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- teams / hospitals ----------
class TeamOut(ORM):
    id: int
    name: str
    team_type: str
    members: int
    phone: str
    base_lat: float
    base_lng: float
    status: str


class HospitalOut(ORM):
    id: int
    name: str
    address: str
    phone: str
    lat: float
    lng: float
    total_beds: int
    available_beds: int
    icu_total: int
    icu_available: int
    ed_status: str
    ed_wait_minutes: int
    specialties: str
    notes: str
    resources_updated_at: datetime


class HospitalUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=255)
    phone: str = Field(min_length=3, max_length=40)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    total_beds: int = Field(ge=0, le=100000)
    available_beds: int = Field(ge=0, le=100000)
    icu_total: int = Field(ge=0, le=10000)
    icu_available: int = Field(ge=0, le=10000)
    ed_status: EdStatus
    ed_wait_minutes: int = Field(ge=0, le=1440)
    specialties: str = Field(default="", max_length=255)
    notes: str = Field(default="", max_length=2000)


# ---------- incidents ----------
class IncidentIn(BaseModel):
    incident_type: IncidentType
    description: str = Field(min_length=10, max_length=2000)
    reported_severity: Severity
    people_affected: int = Field(ge=1, le=10000)
    location_text: str = Field(min_length=3, max_length=255)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    contact_phone: str = Field(default="", max_length=40)


class ClassifyIn(BaseModel):
    incident_type: IncidentType
    description: str = Field(default="", max_length=2000)
    reported_severity: Severity
    people_affected: int = Field(ge=1, le=10000)


class PriorityOverrideIn(BaseModel):
    priority: Priority
    reason: str = Field(min_length=3, max_length=500)


class AssignIn(BaseModel):
    team_id: int


class CloseIn(BaseModel):
    note: str = Field(default="", max_length=1000)


class RespondIn(BaseModel):
    accept: bool
    reason: str = Field(default="", max_length=500)


class AssignmentStatusIn(BaseModel):
    status: Literal["En Route", "On Scene", "Completed"]
    note: str = Field(default="", max_length=500)


class UpdateOut(ORM):
    id: int
    kind: str
    message: str
    created_at: datetime
    author_name: str | None = None


class AssignmentOut(ORM):
    id: int
    incident_id: int
    team_id: int
    team_name: str
    status: str
    response_reason: str
    created_at: datetime
    updated_at: datetime


class IncidentOut(ORM):
    id: int
    code: str
    incident_type: str
    description: str
    reported_severity: str
    people_affected: int
    location_text: str
    lat: float
    lng: float
    contact_phone: str
    auto_priority: str
    priority: str
    priority_score: int
    priority_reason: str
    priority_overridden: bool
    status: str
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    reporter_name: str
    current_team: str | None = None


class IncidentDetailOut(IncidentOut):
    assignments: list[AssignmentOut]
    updates: list[UpdateOut]


class AssignmentWithIncidentOut(AssignmentOut):
    incident: IncidentOut
