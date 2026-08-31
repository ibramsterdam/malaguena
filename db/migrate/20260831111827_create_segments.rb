class CreateSegments < ActiveRecord::Migration[8.1]
  def change
    create_table :segments do |t|
      t.references :routine, null: false, foreign_key: true
      t.references :tab, null: true, foreign_key: true
      t.string :kind, null: false
      t.integer :position, null: false
      t.integer :duration_seconds, null: false
      t.integer :bpm

      t.timestamps
    end
  end
end
