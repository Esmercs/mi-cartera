ALTER TABLE inter_person_debts ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES cards(id);
