"""add_scan_history_composite_index

Revision ID: 43021763fe6f
Revises: 
Create Date: 2026-09-04 09:50:07.400747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43021763fe6f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Single user_email index (if not already created via create_all) + composite for quota
    try:
        op.create_index(op.f('ix_scan_history_user_email'), 'scan_history', ['user_email'], unique=False)
    except Exception:
        pass
    try:
        op.create_index('ix_scan_history_user_type_ts', 'scan_history', ['user_email', 'scan_type', 'timestamp'], unique=False)
    except Exception:
        pass  # index already exists (e.g., SQLite re-run)


def downgrade() -> None:
    """Downgrade schema."""
    try:
        op.drop_index('ix_scan_history_user_type_ts', table_name='scan_history')
    except Exception:
        pass
    try:
        op.drop_index(op.f('ix_scan_history_user_email'), table_name='scan_history')
    except Exception:
        pass
