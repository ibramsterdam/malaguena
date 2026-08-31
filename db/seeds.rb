malaguena_body = <<~TAB
  E|----------|----------|----------|----------|
  B|-------0--|-------0--|----1--0--|----------|
  G|----1-----|----1-----|--2-------|--2--0----|
  D|--2-------|--2-------|----------|-------3--|
  A|----------|----------|----------|----------|
  E|----------|----------|----------|----------|
TAB

malaguena = Tab.find_or_create_by!(title: "Malagueña") do |tab|
  tab.body = malaguena_body.strip
  tab.default_bpm = 80
end

Routine.find_or_create_by!(name: "Morning practice") do |routine|
  routine.segments.build(kind: "tab_practice", position: 1, duration_seconds: 10 * 60, tab: malaguena, bpm: 80)
  routine.segments.build(kind: "rest", position: 2, duration_seconds: 60)
  routine.segments.build(kind: "free_play", position: 3, duration_seconds: 20 * 60)
end
