-- Visual preference only; existing accounts retain the classic design.
ALTER TABLE loyalty_cards ADD COLUMN stamp_style TEXT NOT NULL DEFAULT 'classic' CHECK (stamp_style IN ('classic', 'cowboy', 'bow'));
