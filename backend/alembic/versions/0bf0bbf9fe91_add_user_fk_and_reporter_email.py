"""add_user_fk_and_reporter_email

Revision ID: 0bf0bbf9fe91
Revises: 43021763fe6f
Create Date: 2026-09-06 13:35:19.426493

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0bf0bbf9fe91'
down_revision: Union[str, Sequence[str], None] = '43021763fe6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Uses batch mode for SQLite compatibility (local dev).
    On PostgreSQL (Render), batch mode is a no-op wrapper and FKs apply normally.
    """
    from alembic import op
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)

    # 1. Add reporter_email to scam_reports if not already present
    existing_cols = [c["name"] for c in inspector.get_columns("scam_reports")]
    with op.batch_alter_table("scam_reports", schema=None) as batch_op:
        if "reporter_email" not in existing_cols:
            batch_op.add_column(sa.Column("reporter_email", sa.String(), nullable=True))
        # Index — use raw SQL IF NOT EXISTS (works on SQLite + Postgres)
        bind.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_scam_reports_reporter_email "
            "ON scam_reports (reporter_email)"
        ))

    # 2. Add FK from scan_history.user_email -> users.email
    # SQLite does not enforce FKs by default; batch_alter recreates the table with the constraint.
    with op.batch_alter_table("scan_history", schema=None) as batch_op:
        batch_op.create_foreign_key(
            "fk_scan_history_user_email_users",
            "users",
            ["user_email"],
            ["email"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("scan_history", schema=None) as batch_op:
        batch_op.drop_constraint("fk_scan_history_user_email_users", type_="foreignkey")

    with op.batch_alter_table("scam_reports", schema=None) as batch_op:
        batch_op.drop_index("ix_scam_reports_reporter_email")
        batch_op.drop_column("reporter_email")


