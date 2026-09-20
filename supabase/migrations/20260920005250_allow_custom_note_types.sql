-- Note types are user-managed in rtw_note_types. Keep the saved text as a
-- snapshot so removing a type from the picker does not erase older notes.
-- This changes validation only; no rtw_notes rows are rewritten.
alter table public.rtw_notes
  drop constraint rtw_notes_note_type_check,
  add constraint rtw_notes_note_type_check
    check (
      note_type is null
      or (
        note_type = btrim(note_type)
        and char_length(note_type) between 1 and 30
      )
    );
