class TabsController < ApplicationController
  def index
    @tabs = Tab.order(:title)
  end

  def show
    @tab = Tab.find(params[:id])
  end
end
