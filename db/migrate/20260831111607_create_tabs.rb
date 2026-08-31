class CreateTabs < ActiveRecord::Migration[8.1]
  def change
    create_table :tabs do |t|
      t.string :title
      t.text :body
      t.integer :default_bpm

      t.timestamps
    end
  end
end
