import { createContext, useContext } from 'react'

const FavoritesContext = createContext({
  favorites: [],
  toggleFavorite: () => {},
  removeFavorite: () => {},
  isFavorite: () => false,
})

export const useFavoritesContext = () => useContext(FavoritesContext)
export default FavoritesContext
