# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_31_111827) do
  create_table "routines", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "segments", force: :cascade do |t|
    t.integer "bpm"
    t.datetime "created_at", null: false
    t.integer "duration_seconds", null: false
    t.string "kind", null: false
    t.integer "position", null: false
    t.integer "routine_id", null: false
    t.integer "tab_id"
    t.datetime "updated_at", null: false
    t.index ["routine_id"], name: "index_segments_on_routine_id"
    t.index ["tab_id"], name: "index_segments_on_tab_id"
  end

  create_table "tabs", force: :cascade do |t|
    t.text "body"
    t.datetime "created_at", null: false
    t.integer "default_bpm"
    t.string "title"
    t.datetime "updated_at", null: false
  end

  add_foreign_key "segments", "routines"
  add_foreign_key "segments", "tabs"
end
