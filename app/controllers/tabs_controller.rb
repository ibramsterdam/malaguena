class TabsController < ApplicationController
  before_action :set_tab, only: %i[show edit update destroy]

  def index
    @tabs = Tab.order(:title)
  end

  def show
  end

  def new
    @tab = Tab.new(default_bpm: 80)
  end

  def create
    @tab = Tab.new(tab_params)
    if @tab.save
      redirect_to @tab, notice: "Saved #{@tab.title}."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @tab.update(tab_params)
      redirect_to @tab, notice: "Saved #{@tab.title}."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @tab.destroy
    redirect_to tabs_path, notice: "Deleted #{@tab.title}."
  end

  private

  def set_tab
    @tab = Tab.find(params[:id])
  end

  def tab_params
    params.expect(tab: %i[title body default_bpm])
  end
end
