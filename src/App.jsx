import { useEffect, useRef, useState } from 'react'

import {
  Home,
  BookOpen,
  PenLine,
  Bookmark,
  Quote,
  BarChart3,
  Search,
  Heart,
  Star,
  ArrowLeft,
} from 'lucide-react'

import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useParams,
} from 'react-router-dom'

import './App.css'

import pageletteMascot from './assets/mascot.png'

import { supabase } from './supabaseClient'

/* =====================================================
   HELPERS
===================================================== */

const ACTIVE_USER_KEY =
  'bookshelfActiveUser'

const DISCOVERY_BOOK_KEY =
  'pageletteDiscoveryBook'

function scopedStorageKey(key) {
  const activeId =
    localStorage.getItem(
      ACTIVE_USER_KEY
    )

  return activeId
    ? `${key}:${activeId}`
    : key
}


function userFromSupabase(
  supabaseUser
) {
  if (!supabaseUser) {
    return null
  }

  const name =
    supabaseUser.user_metadata
      ?.name ||
    supabaseUser.email
      ?.split('@')[0] ||
    'reader'

  return {
    id: supabaseUser.id,

    name,

    email:
      supabaseUser.email ||
      '',
  }
}

async function hashPassword(
  password
) {
  const data =
    new TextEncoder().encode(
      password
    )

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      data
    )

  return Array.from(
    new Uint8Array(digest)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
}


function normalizeBook(book) {
  let quotes = Array.isArray(book.quotes)
    ? book.quotes
    : []

  if (
    quotes.length === 0 &&
    typeof book.quote === 'string' &&
    book.quote.trim()
  ) {
    quotes = [
      {
        id: `legacy-${book.key}`,
        text: book.quote,
        page: '',
        pinned: false,
      },
    ]
  }

  return {
    ...book,

    shelf:
      book.shelf ||
      'Want to Read',

    favorite:
      Boolean(book.favorite),

    rating:
      Number(book.rating) || 0,

    review:
      book.review || '',

    reviewUpdatedAt:
      book.reviewUpdatedAt || '',

    pagesRead:
      book.pagesRead ?? '',

    totalPages:
      book.totalPages ?? '',

    startedDate:
      book.startedDate || '',

    finishedDate:
      book.finishedDate || '',

    quotes: quotes.map((quote) => ({
      ...quote,
      pinned:
        Boolean(quote.pinned),
    })),
  }
}

function loadBooks() {
  try {
    const savedBooks =
      localStorage.getItem(
        scopedStorageKey(
          'jessicasBooks'
        )
      )

    if (!savedBooks) {
      return []
    }

    const parsed =
      JSON.parse(savedBooks)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map(
      normalizeBook
    )
  } catch {
    return []
  }
}

function saveBooksToStorage(
  books
) {
  localStorage.setItem(
    scopedStorageKey(
      'jessicasBooks'
    ),
    JSON.stringify(books)
  )

  window.dispatchEvent(
    new Event('booksUpdated')
  )
}

function todayString() {
  const today = new Date()

  const year =
    today.getFullYear()

  const month = String(
    today.getMonth() + 1
  ).padStart(2, '0')

  const day = String(
    today.getDate()
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDate(
  dateString,
  long = false
) {
  if (!dateString) {
    return ''
  }

  const date =
    dateString.includes('T')
      ? new Date(dateString)
      : new Date(
          `${dateString}T00:00:00`
        )

  return date.toLocaleDateString(
    'en-US',
    {
      month: long
        ? 'long'
        : 'short',

      day: 'numeric',
      year: 'numeric',
    }
  )
}

function Stars({
  count = 5,
  size = 17,
}) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map(
        (star) => (
          <Star
            key={star}
            size={size}
            fill={
              star <= count
                ? 'currentColor'
                : 'none'
            }
          />
        )
      )}
    </div>
  )
}


function LoginPage() {
  const [
    mode,
    setMode,
  ] = useState('login')

  const [name, setName] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [
    password,
    setPassword,
  ] = useState('')

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('')

  const [error, setError] =
    useState('')

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(false)

  async function handleSubmit(
    event
  ) {
    event.preventDefault()

    setError('')
    setNotice('')

    const cleanEmail =
      email.trim().toLowerCase()

    if (
      !cleanEmail ||
      !password
    ) {
      setError(
        'Enter your email and password.'
      )

      return
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError(
          'Enter your name.'
        )

        return
      }

      if (
        password.length < 6
      ) {
        setError(
          'Use at least 6 characters for your password.'
        )

        return
      }

      if (
        password !==
        confirmPassword
      ) {
        setError(
          'Your passwords do not match.'
        )

        return
      }
    }

    setLoading(true)

    try {
      if (mode === 'signup') {
        const {
          data,
          error:
            signUpError,
        } =
          await supabase.auth.signUp(
            {
              email:
                cleanEmail,

              password,

              options: {
                data: {
                  name:
                    name.trim(),
                },
              },
            }
          )

        if (signUpError) {
          setError(
            signUpError.message
          )

          return
        }

        if (
          data.user &&
          !data.session
        ) {
          setNotice(
            'Account created! Check your email to confirm your account, then come back and sign in.'
          )

          setMode('login')
          setPassword('')
          setConfirmPassword('')

          return
        }

        setNotice(
          'Account created successfully.'
        )

        return
      }

      const {
        error:
          loginError,
      } =
        await supabase.auth
          .signInWithPassword(
            {
              email:
                cleanEmail,

              password,
            }
          )

      if (loginError) {
        setError(
          loginError.message
        )
      }
    } catch (authError) {
      console.error(
        authError
      )

      setError(
        'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  function switchMode(
    nextMode
  ) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-mark">
          <BookOpen
            size={26}
          />
        </div>

        <p className="login-eyebrow">
          personal reading journal
        </p>

        <h1>
          {mode === 'login'
            ? 'welcome back'
            : 'create your bookshelf'}
        </h1>

        <p className="login-subtitle">
          {mode === 'login'
            ? 'Sign in to continue to your library.'
            : 'Create a personal space for your books, reviews, and reading stats.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={
              mode === 'login'
                ? 'active'
                : ''
            }
            onClick={() =>
              switchMode(
                'login'
              )
            }
          >
            Sign in
          </button>

          <button
            type="button"
            className={
              mode === 'signup'
                ? 'active'
                : ''
            }
            onClick={() =>
              switchMode(
                'signup'
              )
            }
          >
            Create account
          </button>
        </div>

        <form
          className="login-form"
          onSubmit={
            handleSubmit
          }
        >
          {mode ===
            'signup' && (
            <div className="login-field">
              <label>
                Name
              </label>

              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(
                  event
                ) =>
                  setName(
                    event.target
                      .value
                  )
                }
                autoComplete="name"
              />
            </div>
          )}

          <div className="login-field">
            <label>
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(
                event
              ) =>
                setEmail(
                  event.target
                    .value
                )
              }
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label>
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={
                password
              }
              onChange={(
                event
              ) =>
                setPassword(
                  event.target
                    .value
                )
              }
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
            />
          </div>

          {mode ===
            'signup' && (
            <div className="login-field">
              <label>
                Confirm password
              </label>

              <input
                type="password"
                placeholder="••••••••"
                value={
                  confirmPassword
                }
                onChange={(
                  event
                ) =>
                  setConfirmPassword(
                    event.target
                      .value
                  )
                }
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          {notice && (
            <p className="login-notice">
              {notice}
            </p>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : mode ===
                  'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}


/* =====================================================
   LAYOUT
===================================================== */

function Layout({
  children,
  user,
  onLogout,
}) {
  const navigate =
    useNavigate()

  const [
    showProfileMenu,
    setShowProfileMenu,
  ] = useState(false)

  const profileMenuRef =
    useRef(null)

  useEffect(() => {
    function handleClickOutside(
      event
    ) {
      if (
        showProfileMenu &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(
          event.target
        )
      ) {
        setShowProfileMenu(
          false
        )
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      )
    }
  }, [showProfileMenu])

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('')

  const [books, setBooks] =
    useState(loadBooks)

  useEffect(() => {
    function refreshBooks() {
      setBooks(loadBooks())
    }

    window.addEventListener(
      'storage',
      refreshBooks
    )

    window.addEventListener(
      'booksUpdated',
      refreshBooks
    )

    return () => {
      window.removeEventListener(
        'storage',
        refreshBooks
      )

      window.removeEventListener(
        'booksUpdated',
        refreshBooks
      )
    }
  }, [])

  const query =
    searchQuery
      .toLowerCase()
      .trim()

  const searchResults =
    query
      ? books.filter(
          (book) =>
            book.title
              ?.toLowerCase()
              .includes(query) ||
            book.author
              ?.toLowerCase()
              .includes(query)
        )
      : []

  function openBook(book) {
    setSearchQuery('')

    navigate(
      `/books/${encodeURIComponent(
        book.key
      )}`
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div
          className="sidebar-brand"
          onClick={() =>
            navigate('/')
          }
        >
          <img
            src={pageletteMascot}
            alt="Pagelette mascot"
            className="sidebar-mascot"
          />

          <h1 className="sidebar-brand-name">
            Pagelette
          </h1>
        </div>

        <nav className="navigation">
          <NavLink
            to="/"
            end
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <Home size={21} />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/books"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <BookOpen
              size={21}
            />

            <span>
              My Books
            </span>
          </NavLink>

          <NavLink
            to="/reviews"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <PenLine size={21} />

            <span>
              Reviews
            </span>
          </NavLink>

          <NavLink
            to="/want-to-read"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <Bookmark
              size={21}
            />

            <span>
              Want to Read
            </span>
          </NavLink>

          <NavLink
            to="/quotes"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <Quote size={21} />

            <span>
              Quotes
            </span>
          </NavLink>

          <NavLink
            to="/stats"
            className={({
              isActive,
            }) =>
              `nav-item ${
                isActive
                  ? 'active'
                  : ''
              }`
            }
          >
            <BarChart3
              size={21}
            />

            <span>
              Stats
            </span>
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-streak">
            <span className="streak-number">
              0
            </span>

            <div className="streak-copy">
              <p className="streak-title">
                day reading streak
              </p>

              <p className="streak-subtitle">
                keep turning pages
              </p>
            </div>
          </div>

          <p className="pagelette-footer">
            made for readers, by readers
          </p>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="search-wrapper">
            <div className="search">
              <Search
                size={20}
              />

              <input
                type="text"
                placeholder="Search your books..."
                value={
                  searchQuery
                }
                onChange={(
                  event
                ) =>
                  setSearchQuery(
                    event.target
                      .value
                  )
                }
              />
            </div>

            {query && (
              <div className="global-search-dropdown">
                {searchResults.length >
                0 ? (
                  searchResults
                    .slice(0, 6)
                    .map(
                      (book) => (
                        <button
                          className="global-search-result"
                          key={
                            book.key
                          }
                          onClick={() =>
                            openBook(
                              book
                            )
                          }
                        >
                          {book.cover ? (
                            <img
                              src={
                                book.cover
                              }
                              alt={
                                book.title
                              }
                            />
                          ) : (
                            <div className="global-search-cover-placeholder">
                              <BookOpen
                                size={
                                  20
                                }
                              />
                            </div>
                          )}

                          <div>
                            <strong>
                              {
                                book.title
                              }
                            </strong>

                            <span>
                              {
                                book.author
                              }
                            </span>
                          </div>
                        </button>
                      )
                    )
                ) : (
                  <div className="global-search-empty">
                    <Search
                      size={22}
                    />

                    <p>
                      No books found
                      
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="profile">
<div
              className="profile-menu-wrap"
              ref={profileMenuRef}
            >
              <button
  className="avatar avatar-button"
  onClick={() =>
    setShowProfileMenu(
      !showProfileMenu
    )
  }
>
  <span className="avatar-letter">
    {user.name
      .charAt(0)
      .toUpperCase()}
  </span>
</button>

              {showProfileMenu && (
                <div className="profile-dropdown">
                  <strong>
                    {user.name}
                  </strong>

                  <span>
                    {user.email}
                  </span>

                  <button
                    onClick={
                      onLogout
                    }
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {children}
      </main>
    </div>
  )
}

/* =====================================================
   HOME
===================================================== */

function HomePage({
  user,
}) {
  const navigate =
    useNavigate()

  const [
    heroImage,
    setHeroImage,
  ] = useState(() => {
    return (
      localStorage.getItem(
        scopedStorageKey(
          'heroBackground'
        )
      ) ||
      'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1700&q=90'
    )
  })

  const [books, setBooks] =
    useState(loadBooks)

  useEffect(() => {
    function refreshBooks() {
      setBooks(loadBooks())
    }

    window.addEventListener(
      'booksUpdated',
      refreshBooks
    )

    return () =>
      window.removeEventListener(
        'booksUpdated',
        refreshBooks
      )
  }, [])

  const [
    readingGoal,
    setReadingGoal,
  ] = useState(() => {
    const savedGoal =
      localStorage.getItem(
        scopedStorageKey(
          'readingGoal'
        )
      )

    return savedGoal
      ? Number(savedGoal)
      : 40
  })

  const [
    editingGoal,
    setEditingGoal,
  ] = useState(false)

  useEffect(() => {
    localStorage.setItem(
      scopedStorageKey(
        'readingGoal'
      ),
      readingGoal
    )
  }, [readingGoal])

  const currentlyReading =
    books.filter(
      (book) =>
        book.shelf ===
        'Currently Reading'
    )

  const wantToReadBooks =
    books.filter(
      (book) =>
        book.shelf ===
        'Want to Read'
    )

  const finishedBooks =
    books.filter(
      (book) =>
        book.shelf ===
        'Finished'
    )

  const reviewedBooks =
    books.filter(
      (book) =>
        book.review?.trim() ||
        Number(
          book.rating
        ) > 0
    )

  const ratedBooks =
    books.filter(
      (book) =>
        Number(
          book.rating
        ) > 0
    )

  const totalPagesRead =
    books.reduce(
      (total, book) =>
        total +
        Number(
          book.pagesRead ||
            0
        ),
      0
    )

  const averageRating =
    ratedBooks.length > 0
      ? (
          ratedBooks.reduce(
            (
              total,
              book
            ) =>
              total +
              Number(
                book.rating ||
                  0
              ),
            0
          ) /
          ratedBooks.length
        ).toFixed(1)
      : '0.0'

  const currentBook =
    currentlyReading[0] ||
    null

  const latestReviews =
    [...reviewedBooks]
      .sort((a, b) => {
        const dateA =
          new Date(
            a.reviewUpdatedAt ||
              a.finishedDate ||
              a.startedDate ||
              0
          )

        const dateB =
          new Date(
            b.reviewUpdatedAt ||
              b.finishedDate ||
              b.startedDate ||
              0
          )

        return dateB - dateA
      })
      .slice(0, 2)

  const allQuotes =
    books.flatMap(
      (book) =>
        (book.quotes || [])
          .filter(
            (quote) =>
              quote.text?.trim()
          )
          .map(
            (quote) => ({
              ...quote,
              book,
            })
          )
    )

  const pinnedQuote =
    allQuotes.find(
      (quote) =>
        quote.pinned
    )

  const favoriteQuote =
    pinnedQuote ||
    (
      allQuotes.length
        ? allQuotes[
            allQuotes.length - 1
          ]
        : null
    )

  const goalPercent =
    readingGoal > 0
      ? Math.min(
          Math.round(
            (finishedBooks.length /
              readingGoal) *
              100
          ),
          100
        )
      : 0

  function calculateProgress(
    book
  ) {
    if (!book) return 0

    const pagesRead =
      Number(
        book.pagesRead
      ) || 0

    const totalPages =
      Number(
        book.totalPages
      ) || 0

    if (!totalPages) {
      return 0
    }

    return Math.min(
      Math.round(
        (pagesRead /
          totalPages) *
          100
      ),
      100
    )
  }

  const currentProgress =
    calculateProgress(
      currentBook
    )

  const recentActivity =
    books
      .flatMap((book) => {
        const activities = []

        if (book.startedDate) {
          activities.push({
            type: 'started',

            date:
              book.startedDate,

            text:
              `Started reading ${book.title}`,

            book,
          })
        }

        if (book.finishedDate) {
          activities.push({
            type: 'finished',

            date:
              book.finishedDate,

            text:
              `Finished ${book.title}`,

            book,
          })
        }

        if (
          Number(book.rating) > 0
        ) {
          activities.push({
            type: 'rated',

            date:
              book.reviewUpdatedAt ||
              book.finishedDate ||
              book.startedDate ||
              '',

            text:
              `Rated ${book.title} ${book.rating}★`,

            book,
          })
        }

        if (
          book.review?.trim()
        ) {
          activities.push({
            type: 'reviewed',

            date:
              book.reviewUpdatedAt ||
              book.finishedDate ||
              book.startedDate ||
              '',

            text:
              `Reviewed ${book.title}`,

            book,
          })
        }

        ;(book.quotes || [])
          .filter(
            (quote) =>
              quote.text?.trim()
          )
          .forEach((quote) => {
            activities.push({
              type: 'quote',

              date:
                quote.updatedAt ||
                quote.createdAt ||
                book.reviewUpdatedAt ||
                book.finishedDate ||
                book.startedDate ||
                '',

              text:
                `Saved a quote from ${book.title}`,

              book,
            })
          })

        return activities
      })
      .filter(
        (activity) =>
          activity.date
      )
      .sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      )
      .slice(0, 6)

  function getActivityIcon(
    type
  ) {
    if (type === 'started') {
      return (
        <BookOpen
          size={17}
        />
      )
    }

    if (type === 'finished') {
      return (
        <Heart
          size={17}
        />
      )
    }

    if (type === 'rated') {
      return (
        <Star
          size={17}
        />
      )
    }

    if (type === 'reviewed') {
      return (
        <PenLine
          size={17}
        />
      )
    }

    return (
      <Quote
        size={17}
      />
    )
  }

  function changeHeroImage(event) {
    const file =
      event.target.files?.[0]

    if (!file) {
      return
    }

    const reader =
      new FileReader()

    reader.onload = () => {
      const image =
        reader.result

      setHeroImage(image)

      localStorage.setItem(
        scopedStorageKey(
          'heroBackground'
        ),
        image
      )
    }

    reader.readAsDataURL(file)
  }

  return (
    <>
      <section
        className="hero"
        style={{
          backgroundImage: `
            linear-gradient(
              90deg,
              rgba(248, 246, 246, 0.88) 0%,
              rgba(248, 246, 246, 0.58) 42%,
              rgba(248, 246, 246, 0.08) 78%
            ),
            url("${heroImage}")
          `,
        }}
      >
        <div className="hero-content">
          <h2>
            welcome back,{' '}
            {user.name.toLowerCase()}
          </h2>

          <div className="hero-buttons">
            <button
              onClick={() =>
                navigate('/books')
              }
            >
              Log Reading
            </button>
          </div>

          <label className="change-hero-button">

              Change Background

              <input
                type="file"
                accept="image/*"
                onChange={
                  changeHeroImage
                }
              />
                      </label>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card current-reading">
          <div className="card-title">
            <div className="title-icon">
              <BookOpen
                size={20}
              />
            </div>

            <h3>
              Currently Reading
            </h3>
          </div>

          {currentBook ? (
            <div
              className="current-book"
              onClick={() =>
                navigate(
                  `/books/${encodeURIComponent(
                    currentBook.key
                  )}`
                )
              }
              style={{
                cursor:
                  'pointer',
              }}
            >
              {currentBook.cover ? (
                <img
                  src={
                    currentBook.cover
                  }
                  alt={
                    currentBook.title
                  }
                />
              ) : (
                <div className="library-missing-cover">
                  <BookOpen
                    size={32}
                  />
                </div>
              )}

              <div className="book-info">
                <h4>
                  {
                    currentBook.title
                  }
                </h4>

                <p>
                  {
                    currentBook.author
                  }
                </p>

                <div className="progress-label">
                  {
                    currentProgress
                  }
                  %{' '}
                  <span>
                    complete
                  </span>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress"
                    style={{
                      width: `${currentProgress}%`,
                    }}
                  ></div>
                </div>

                <p className="pages">
                  {Number(
                    currentBook.pagesRead
                  ) || 0}

                  {Number(
                    currentBook.totalPages
                  ) > 0
                    ? ` / ${currentBook.totalPages}`
                    : ''}{' '}
                  pages
                </p>
              </div>
            </div>
          ) : (
            <div className="home-empty-card">
              <BookOpen
                size={28}
              />

              <p>
                Nothing here yet
              </p>

              <button
                onClick={() =>
                  navigate(
                    '/books'
                  )
                }
              >
                Pick a book
              </button>
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <div className="card-title">
            <div className="title-icon">
              <Star size={20} />
            </div>

            <h3>
              Recent Reviews
            </h3>
          </div>

          {latestReviews.length >
          0 ? (
            latestReviews.map(
              (book) => (
                <div
                  className="review"
                  key={
                    book.key
                  }
                  onClick={() =>
                    navigate(
                      `/books/${encodeURIComponent(
                        book.key
                      )}`
                    )
                  }
                  style={{
                    cursor:
                      'pointer',
                  }}
                >
                  <p className="review-title">
                    {
                      book.title
                    }
                  </p>

                  <Stars
                    count={
                      Number(
                        book.rating
                      ) || 0
                    }
                  />
                </div>
              )
            )
          ) : (
            <div className="home-empty-card small">
              <Star
                size={25}
              />

              <p>
                No reviews yet
              </p>
            </div>
          )}
        </div>

        <div className="dashboard-card goal-card">
          <div className="card-title">
            <div className="title-icon">
              <BookOpen size={18} />
            </div>

            <h3>
              Reading Goal
            </h3>
          </div>

          <div
            className="goal-circle"
            style={{
              background: `conic-gradient(
                var(--pink) 0deg ${goalPercent * 3.6}deg,
                #ebe9eb ${goalPercent * 3.6}deg 360deg
              )`,
            }}
          >
            <div className="goal-inner">
              <strong>
                {finishedBooks.length}
              </strong>

              <span>
                of {readingGoal}
              </span>

              <small>
                books
              </small>
            </div>
          </div>

          <p className="goal-text">
            {goalPercent}% complete
          </p>

          {editingGoal && (
            <div className="goal-editor">
              <input
                type="number"
                min="1"
                max="500"
                value={readingGoal}
                onChange={(event) =>
                  setReadingGoal(
                    Math.max(
                      1,
                      Number(event.target.value)
                    )
                  )
                }
              />

              <span>
                books
              </span>

              <button
                onClick={() =>
                  setEditingGoal(false)
                }
              >
                Done
              </button>
            </div>
          )}

          {!editingGoal && (
            <button
              className="edit-goal-button"
              onClick={() =>
                setEditingGoal(true)
              }
            >
              Edit goal
            </button>
          )}
        </div>

        <div className="dashboard-card streak-card">
          <div className="card-title">
            <div className="title-icon">
              <BarChart3
                size={20}
              />
            </div>

            <h3>
              Your Library
            </h3>
          </div>

          <div className="library-count">
            <strong>
              {books.length}
            </strong>

            <span>
              books
            </span>
          </div>

          <small>
            {
              finishedBooks.length
            }{' '}
            finished
          </small>
        </div>
      </section>

      <section className="lower-grid">
        <div className="dashboard-card want-card">
          <div className="section-heading">
            <div className="card-title">
              <div className="title-icon">
                <Bookmark
                  size={20}
                />
              </div>

              <h3>
                Want to Read
              </h3>
            </div>

            <button
              className="view-all"
              onClick={() =>
                navigate(
                  '/want-to-read'
                )
              }
            >
              View all
            </button>
          </div>

          {wantToReadBooks.length >
          0 ? (
            <div className="book-row">
              {wantToReadBooks
                .slice(0, 4)
                .map(
                  (book) => (
                    <div
                      className="book-cover"
                      key={
                        book.key
                      }
                      onClick={() =>
                        navigate(
                          `/books/${encodeURIComponent(
                            book.key
                          )}`
                        )
                      }
                    >
                      {book.cover ? (
                        <img
                          src={
                            book.cover
                          }
                          alt={
                            book.title
                          }
                        />
                      ) : (
                        <div className="library-missing-cover">
                          <BookOpen
                            size={
                              28
                            }
                          />
                        </div>
                      )}
                    </div>
                  )
                )}
            </div>
          ) : (
            <div className="home-empty-card">
              <Bookmark
                size={28}
              />

              <p>
                Your TBR is empty
              </p>

              <button
                onClick={() =>
                  navigate(
                    '/books'
                  )
                }
              >
                Add books
              </button>
            </div>
          )}

          {wantToReadBooks.length >
            0 && (
            <button
              className="add-books"
              onClick={() =>
                navigate(
                  '/books'
                )
              }
            >
              + Add more books to
              your list
            </button>
          )}
        </div>

        <div className="dashboard-card stats-card">
          <div className="section-heading">
            <h3>
              Reading Stats
            </h3>

            <button
              className="view-all"
              onClick={() =>
                navigate(
                  '/stats'
                )
              }
            >
              View all
            </button>
          </div>

          <div className="home-real-stats">
            <div>
              <strong>
                {
                  finishedBooks.length
                }
              </strong>

              <span>
                Books Read
              </span>
            </div>

            <div>
              <strong>
                {totalPagesRead.toLocaleString()}
              </strong>

              <span>
                Pages Read
              </span>
            </div>

            <div>
              <strong>
                {
                  averageRating
                }
              </strong>

              <span>
                Avg. Rating
              </span>
            </div>
          </div>

          <div className="home-library-breakdown">
            <div>
              <span>
                Currently Reading
              </span>

              <strong>
                {
                  currentlyReading.length
                }
              </strong>
            </div>

            <div>
              <span>
                Want to Read
              </span>

              <strong>
                {
                  wantToReadBooks.length
                }
              </strong>
            </div>

            <div>
              <span>
                Reviews
              </span>

              <strong>
                {
                  reviewedBooks.length
                }
              </strong>
            </div>
          </div>
        </div>

        <div className="dashboard-card activity-card">
          <div className="section-heading">
            <div className="card-title">
              <div className="title-icon">
                <BookOpen
                  size={20}
                />
              </div>

              <h3>
                Recent Activity
              </h3>
            </div>
          </div>

          {recentActivity.length >
          0 ? (
            <div className="activity-list">
              {recentActivity.map(
                (
                  activity,
                  index
                ) => (
                  <button
                    className="activity-item"
                    key={`${activity.book.key}-${activity.type}-${activity.date}-${index}`}
                    onClick={() =>
                      navigate(
                        `/books/${encodeURIComponent(
                          activity.book
                            .key
                        )}`
                      )
                    }
                  >
                    <div className="activity-icon">
                      {getActivityIcon(
                        activity.type
                      )}
                    </div>

                    <div className="activity-info">
                      <strong>
                        {
                          activity.text
                        }
                      </strong>

                      <span>
                        {formatDate(
                          activity.date
                        )}
                      </span>
                    </div>
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="home-empty-card">
              <BookOpen
                size={26}
              />

              <p>
                Your reading
                activity will
                appear here 
              </p>
            </div>
          )}

          <div className="quote-card-footer">
            <span>Save the lines you want to remember.</span>

            <button
              onClick={() =>
                navigate('/quotes')
              }
            >
              Open quotes
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

/* =====================================================
   MY BOOKS
===================================================== */

function MyBooksPage() {
  const navigate =
    useNavigate()

  const [
    showAddBook,
    setShowAddBook,
  ] = useState(false)

  const [query, setQuery] =
    useState('')

  const [results, setResults] =
    useState([])

  const [loading, setLoading] =
    useState(false)

  const [
    activeShelf,
    setActiveShelf,
  ] = useState('All')

  const [
    myBooks,
    setMyBooks,
  ] = useState(loadBooks)

  useEffect(() => {
    saveBooksToStorage(
      myBooks
    )
  }, [myBooks])

  async function searchBooks() {
    if (!query.trim()) {
      return
    }

    setLoading(true)
    setResults([])

    try {
      const response =
        await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(
            query
          )}&limit=8`
        )

      const data =
        await response.json()

      setResults(
        data.docs || []
      )
    } catch (error) {
      console.error(
        'Error searching books:',
        error
      )
    } finally {
      setLoading(false)
    }
  }

  function openDiscovery(book) {
    const discoveryBook = {
      key:
        book.key,

      title:
        book.title,

      author:
        book.author_name?.[0] ||
        'Unknown author',

      year:
        book.first_publish_year ||
        null,

      cover:
        book.cover_i
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
          : null,

      totalPages:
        book.number_of_pages_median ||
        '',
    }

    sessionStorage.setItem(
      DISCOVERY_BOOK_KEY,
      JSON.stringify(
        discoveryBook
      )
    )

    navigate(
      `/discover/${encodeURIComponent(
        book.key
      )}`
    )
  }

  function addBook(book) {
    const alreadyAdded =
      myBooks.some(
        (savedBook) =>
          savedBook.key ===
          book.key
      )

    if (alreadyAdded) {
      return
    }

    const newBook = {
      key: book.key,

      title: book.title,

      author:
        book.author_name?.[0] ||
        'Unknown author',

      year:
        book.first_publish_year ||
        null,

      cover: book.cover_i
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
        : null,

      shelf:
        'Want to Read',

      favorite: false,

      rating: 0,

      review: '',

      reviewUpdatedAt: '',

      quotes: [],

      pagesRead: '',

      totalPages:
        book.number_of_pages_median ||
        '',

      startedDate: '',

      finishedDate: '',
    }

    setMyBooks(
      (books) => [
        ...books,
        newBook,
      ]
    )
  }

  function removeBook(
    bookKey
  ) {
    setMyBooks((books) =>
      books.filter(
        (book) =>
          book.key !==
          bookKey
      )
    )
  }

  function changeShelf(
    bookKey,
    shelf
  ) {
    setMyBooks((books) =>
      books.map((book) => {
        if (
          book.key !==
          bookKey
        ) {
          return book
        }

        const today =
          todayString()

        if (
          shelf ===
          'Want to Read'
        ) {
          return {
            ...book,

            shelf:
              'Want to Read',

            startedDate: '',

            finishedDate: '',

            pagesRead: '',
          }
        }

        if (
          shelf ===
          'Currently Reading'
        ) {
          return {
            ...book,

            shelf:
              'Currently Reading',

            startedDate:
              book.startedDate ||
              today,

            finishedDate: '',
          }
        }

        if (
          shelf ===
          'Finished'
        ) {
          return {
            ...book,

            shelf: 'Finished',

            startedDate:
              book.startedDate ||
              today,

            finishedDate:
              book.finishedDate ||
              today,

            pagesRead:
              Number(
                book.totalPages
              ) > 0
                ? Number(
                    book.totalPages
                  )
                : book.pagesRead,
          }
        }

        if (
          shelf === 'DNF'
        ) {
          return {
            ...book,

            shelf: 'DNF',

            startedDate:
              book.startedDate ||
              today,

            finishedDate: '',
          }
        }

        return book
      })
    )
  }

  function toggleFavorite(
    bookKey
  ) {
    setMyBooks((books) =>
      books.map((book) =>
        book.key === bookKey
          ? {
              ...book,

              favorite:
                !book.favorite,
            }
          : book
      )
    )
  }

  const filteredBooks =
    myBooks.filter(
      (book) => {
        if (
          activeShelf ===
          'All'
        ) {
          return true
        }

        if (
          activeShelf ===
          'Favorites'
        ) {
          return book.favorite
        }

        return (
          book.shelf ===
          activeShelf
        )
      }
    )

  const shelves = [
    'All',
    'Currently Reading',
    'Finished',
    'Favorites',
    'DNF',
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            your library
          </p>

          <h2>
            My Books
          </h2>

          <p>
            All the books you’re
            reading, loving, and
            saving for later.
          </p>
        </div>

        <button
          className="pink-button"
          onClick={() =>
            setShowAddBook(
              true
            )
          }
        >
          + Add Book
        </button>
      </div>

      <div className="shelf-tabs">
        {shelves.map(
          (shelf) => (
            <button
              key={shelf}
              className={
                activeShelf ===
                shelf
                  ? 'shelf-tab active'
                  : 'shelf-tab'
              }
              onClick={() =>
                setActiveShelf(
                  shelf
                )
              }
            >
              {shelf}
            </button>
          )
        )}
      </div>

      {filteredBooks.length >
      0 ? (
        <div className="library-grid">
          {filteredBooks.map(
            (book) => (
              <div
                className="library-book"
                key={book.key}
              >
                <div
                  className="library-cover-container"
                  onClick={() =>
                    navigate(
                      `/books/${encodeURIComponent(
                        book.key
                      )}`
                    )
                  }
                  style={{
                    cursor:
                      'pointer',
                  }}
                >
                  {book.cover ? (
                    <img
                      src={
                        book.cover
                      }
                      alt={
                        book.title
                      }
                    />
                  ) : (
                    <div className="library-missing-cover">
                      <BookOpen
                        size={35}
                      />
                    </div>
                  )}

                  <button
                    className={
                      book.favorite
                        ? 'favorite-book-button favorited'
                        : 'favorite-book-button'
                    }
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation()

                      toggleFavorite(
                        book.key
                      )
                    }}
                  >
                    <Bookmark
                      size={18}
                      fill={
                        book.favorite
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>
                </div>

                <div className="library-book-info">
                  <h3
                    onClick={() =>
                      navigate(
                        `/books/${encodeURIComponent(
                          book.key
                        )}`
                      )
                    }
                    style={{
                      cursor:
                        'pointer',
                    }}
                  >
                    {
                      book.title
                    }
                  </h3>

                  <p className="library-author">
                    {
                      book.author
                    }
                  </p>

                  <select
                    className="shelf-select"
                    value={
                      book.shelf ||
                      'Want to Read'
                    }
                    onChange={(
                      event
                    ) =>
                      changeShelf(
                        book.key,
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="Want to Read">
                      Want to Read
                    </option>

                    <option value="Currently Reading">
                      Currently
                      Reading
                    </option>

                    <option value="Finished">
                      Finished
                    </option>

                    <option value="DNF">
                      DNF
                    </option>
                  </select>

                  <button
                    className="remove-book-button"
                    onClick={() =>
                      removeBook(
                        book.key
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="empty-library">
          <BookOpen
            size={38}
          />

          <h3>
            Your shelf is
            waiting 
          </h3>

          <p>
            Add some books to
            start building your
            library.
          </p>

          <button
            className="pink-button"
            onClick={() =>
              setShowAddBook(
                true
              )
            }
          >
            + Add your first
            book
          </button>
        </div>
      )}

      {showAddBook && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowAddBook(
              false
            )
          }
        >
          <div
            className="add-book-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="close-modal"
              onClick={() =>
                setShowAddBook(
                  false
                )
              }
            >
              ×
            </button>

            <p className="eyebrow">
              add to your
              library
            </p>

            <h2>
              Find a book 
            </h2>

            <p className="modal-subtitle">
              Search by title
              or author.
            </p>

            <div className="modal-search">
              <Search
                size={19}
              />

              <input
                type="text"
                placeholder="Search for a book..."
                value={query}
                onChange={(
                  event
                ) =>
                  setQuery(
                    event.target
                      .value
                  )
                }
                onKeyDown={(
                  event
                ) => {
                  if (
                    event.key ===
                    'Enter'
                  ) {
                    searchBooks()
                  }
                }}
              />

              <button
                onClick={
                  searchBooks
                }
              >
                Search
              </button>
            </div>

            <div className="search-results">
              {loading && (
                <p className="search-message">
                  Searching... 
                </p>
              )}

              {!loading &&
                results.map(
                  (book) => {
                    const coverUrl =
                      book.cover_i
                        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
                        : null

                    const alreadyAdded =
                      myBooks.some(
                        (
                          savedBook
                        ) =>
                          savedBook.key ===
                          book.key
                      )

                    return (
                      <div
                        className="search-result-book discovery-search-result"
                        key={
                          book.key
                        }
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          openDiscovery(
                            book
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                              'Enter' ||
                            event.key ===
                              ' '
                          ) {
                            event.preventDefault()

                            openDiscovery(
                              book
                            )
                          }
                        }}
                      >
                        {coverUrl ? (
                          <img
                            src={
                              coverUrl
                            }
                            alt={
                              book.title
                            }
                          />
                        ) : (
                          <div className="missing-cover">
                            <BookOpen
                              size={
                                25
                              }
                            />
                          </div>
                        )}

                        <div className="search-result-info">
                          <h3>
                            {
                              book.title
                            }
                          </h3>

                          <p>
                            {book
                              .author_name?.[0] ||
                              'Unknown author'}
                          </p>

                          {book.first_publish_year && (
                            <small>
                              {
                                book.first_publish_year
                              }
                            </small>
                          )}

                          <span className="discovery-search-hint">
                            View summary &
                            reader reviews
                          </span>
                        </div>

                        <button
                          className={
                            alreadyAdded
                              ? 'result-add-button added'
                              : 'result-add-button'
                          }
                          disabled={
                            alreadyAdded
                          }
                          onClick={(
                            event
                          ) => {
                            event.stopPropagation()

                            addBook(
                              book
                            )
                          }}
                        >
                          {alreadyAdded
                            ? '✓ Added'
                            : '+ Add'}
                        </button>
                      </div>
                    )
                  }
                )}
            </div>

            {!loading &&
              !results.length && (
                <div className="modal-example">
                  <BookOpen
                    size={32}
                  />

                  <p>
                    Search for a
                    book to see
                    results here.
                  </p>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}


/* =====================================================
   DISCOVER A BOOK
===================================================== */

function DiscoveryBookPage({
  user,
}) {
  const navigate =
    useNavigate()

  const { bookKey } =
    useParams()

  const decodedKey =
    decodeURIComponent(
      bookKey
    )

  const [
    book,
    setBook,
  ] = useState(null)

  const [
    summary,
    setSummary,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    loadError,
    setLoadError,
  ] = useState('')

  const [
    publicReviews,
    setPublicReviews,
  ] = useState([])

  const [
    reviewsLoading,
    setReviewsLoading,
  ] = useState(true)

  const [
    savedBooks,
    setSavedBooks,
  ] = useState(loadBooks)

  const savedBook =
    savedBooks.find(
      (saved) =>
        saved.key ===
        decodedKey
    )

  useEffect(() => {
    let cancelled = false

    async function loadDiscoveryBook() {
      setLoading(true)
      setLoadError('')

      let cachedBook = null

      try {
        const cached =
          sessionStorage.getItem(
            DISCOVERY_BOOK_KEY
          )

        if (cached) {
          const parsed =
            JSON.parse(cached)

          if (
            parsed?.key ===
            decodedKey
          ) {
            cachedBook =
              parsed

            setBook(parsed)
          }
        }
      } catch {
        cachedBook = null
      }

      try {
        const normalizedKey =
          decodedKey.startsWith('/')
            ? decodedKey
            : `/${decodedKey}`

        const response =
          await fetch(
            `https://openlibrary.org${normalizedKey}.json`
          )

        if (!response.ok) {
          throw new Error(
            'Could not load this book.'
          )
        }

        const data =
          await response.json()

        let description = ''

        if (
          typeof data.description ===
          'string'
        ) {
          description =
            data.description
        } else if (
          data.description?.value
        ) {
          description =
            data.description.value
        }

        let author =
          cachedBook?.author ||
          ''

        const authorKey =
          data.authors?.[0]
            ?.author?.key ||
          data.authors?.[0]
            ?.key ||
          ''

        if (
          (!author ||
            author ===
              'Unknown author') &&
          authorKey
        ) {
          try {
            const authorResponse =
              await fetch(
                `https://openlibrary.org${authorKey}.json`
              )

            if (
              authorResponse.ok
            ) {
              const authorData =
                await authorResponse
                  .json()

              author =
                authorData.name ||
                author
            }
          } catch (authorError) {
            console.error(
              'Error loading author:',
              authorError
            )
          }
        }

        const coverId =
          Array.isArray(
            data.covers
          ) &&
          data.covers.length
            ? data.covers[0]
            : null

        const loadedBook = {
          key:
            decodedKey,

          title:
            data.title ||
            cachedBook?.title ||
            'Untitled',

          author:
            author ||
            'Unknown author',

          year:
            cachedBook?.year ||
            (
              data.first_publish_date
                ? String(
                    data.first_publish_date
                  ).match(
                    /\d{4}/
                  )?.[0]
                : null
            ),

          cover:
            cachedBook?.cover ||
            (
              coverId
                ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
                : null
            ),

          totalPages:
            cachedBook?.totalPages ||
            '',
        }

        if (!cancelled) {
          setBook(
            loadedBook
          )

          setSummary(
            description.trim()
          )

          sessionStorage.setItem(
            DISCOVERY_BOOK_KEY,
            JSON.stringify(
              loadedBook
            )
          )
        }
      } catch (error) {
        console.error(
          'Error loading discovery book:',
          error
        )

        if (
          !cancelled &&
          !cachedBook
        ) {
          setLoadError(
            'We could not load this book right now.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDiscoveryBook()

    return () => {
      cancelled = true
    }
  }, [decodedKey])

  useEffect(() => {
    let cancelled = false

    async function loadPublicReviews() {
      setReviewsLoading(true)

      try {
        const {
          data,
          error,
        } =
          await supabase
            .from('reviews')
            .select(
              'id, user_id, reviewer_name, rating, review, updated_at'
            )
            .eq(
              'book_key',
              decodedKey
            )
            .eq(
              'is_public',
              true
            )
            .order(
              'updated_at',
              {
                ascending:
                  false,
              }
            )

        if (error) {
          throw error
        }

        if (!cancelled) {
          setPublicReviews(
            data || []
          )
        }
      } catch (error) {
        console.error(
          'Error loading discovery reviews:',
          error
        )

        if (!cancelled) {
          setPublicReviews([])
        }
      } finally {
        if (!cancelled) {
          setReviewsLoading(
            false
          )
        }
      }
    }

    loadPublicReviews()

    return () => {
      cancelled = true
    }
  }, [decodedKey])

  function addToLibrary(
    shelf
  ) {
    if (!book) {
      return
    }

    if (savedBook) {
      navigate(
        `/books/${encodeURIComponent(
          savedBook.key
        )}`
      )

      return
    }

    const today =
      todayString()

    const newBook =
      normalizeBook({
        key:
          book.key,

        title:
          book.title,

        author:
          book.author ||
          'Unknown author',

        year:
          book.year ||
          null,

        cover:
          book.cover ||
          null,

        shelf,

        favorite: false,

        rating: 0,

        review: '',

        reviewUpdatedAt: '',

        quotes: [],

        pagesRead:
          shelf ===
            'Finished' &&
          Number(
            book.totalPages
          ) > 0
            ? Number(
                book.totalPages
              )
            : '',

        totalPages:
          book.totalPages ||
          '',

        startedDate:
          shelf ===
            'Currently Reading' ||
          shelf ===
            'Finished'
            ? today
            : '',

        finishedDate:
          shelf ===
          'Finished'
            ? today
            : '',
      })

    const updatedBooks = [
      ...savedBooks,
      newBook,
    ]

    setSavedBooks(
      updatedBooks
    )

    saveBooksToStorage(
      updatedBooks
    )

    navigate(
      `/books/${encodeURIComponent(
        newBook.key
      )}`
    )
  }

  if (
    loading &&
    !book
  ) {
    return (
      <div className="discovery-loading-card">
        <BookOpen
          size={34}
        />

        <p>
          Opening this book...
        </p>
      </div>
    )
  }

  if (
    loadError &&
    !book
  ) {
    return (
      <div className="empty-page-card">
        <BookOpen
          size={38}
        />

        <h3>
          Book unavailable
        </h3>

        <p>
          {loadError}
        </p>

        <button
          className="pink-button"
          onClick={() =>
            navigate('/books')
          }
        >
          Back to search
        </button>
      </div>
    )
  }

  return (
    <div className="page discovery-page">
      <button
        className="detail-back-button"
        onClick={() =>
          navigate('/books')
        }
      >
        <ArrowLeft
          size={17}
        />

        Back to My Books
      </button>

      <section className="discovery-hero-card">
        <div className="discovery-cover-wrap">
          {book?.cover ? (
            <img
              src={
                book.cover
              }
              alt={
                book.title
              }
            />
          ) : (
            <div className="discovery-no-cover">
              <BookOpen
                size={42}
              />
            </div>
          )}
        </div>

        <div className="discovery-book-info">
          <p className="eyebrow">
            discover your next
            read
          </p>

          <h1>
            {book?.title}
          </h1>

          <p className="discovery-author">
            {book?.author}
          </p>

          {book?.year && (
            <p className="discovery-year">
              First published{' '}
              {book.year}
            </p>
          )}

          {savedBook ? (
            <div className="discovery-library-notice">
              <Bookmark
                size={17}
                fill="currentColor"
              />

              <span>
                Already in your
                library ·{' '}
                {savedBook.shelf}
              </span>

              <button
                onClick={() =>
                  navigate(
                    `/books/${encodeURIComponent(
                      savedBook.key
                    )}`
                  )
                }
              >
                Open book
              </button>
            </div>
          ) : (
            <>
              <p className="discovery-action-label">
                Add to your
                library
              </p>

              <div className="discovery-actions">
                <button
                  className="discovery-action primary"
                  onClick={() =>
                    addToLibrary(
                      'Want to Read'
                    )
                  }
                >
                  <Bookmark
                    size={17}
                  />

                  Want to Read
                </button>

                <button
                  className="discovery-action"
                  onClick={() =>
                    addToLibrary(
                      'Currently Reading'
                    )
                  }
                >
                  <BookOpen
                    size={17}
                  />

                  Start Reading
                </button>

                <button
                  className="discovery-action"
                  onClick={() =>
                    addToLibrary(
                      'Finished'
                    )
                  }
                >
                  <Star
                    size={17}
                  />

                  Finished
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="discovery-summary-card">
        <div className="discovery-section-heading">
          <div>
            <p className="eyebrow">
              before you read
            </p>

            <h2>
              About This Book
            </h2>
          </div>

          <span className="spoiler-free-label">
            spoiler-free
          </span>
        </div>

        {summary ? (
          <p className="discovery-summary-text">
            {summary}
          </p>
        ) : (
          <div className="discovery-summary-empty">
            <BookOpen
              size={24}
            />

            <p>
              No summary is
              available for this
              book yet.
            </p>
          </div>
        )}
      </section>

      <section className="discovery-reviews-section">
        <div className="discovery-section-heading">
          <div>
            <p className="eyebrow">
              from the community
            </p>

            <h2>
              Reader Reviews
            </h2>
          </div>

          {!reviewsLoading && (
            <span className="discovery-review-count">
              {
                publicReviews.length
              }{' '}
              {publicReviews.length ===
              1
                ? 'review'
                : 'reviews'}
            </span>
          )}
        </div>

        {reviewsLoading ? (
          <div className="discovery-reviews-empty">
            <p>
              Loading reviews...
            </p>
          </div>
        ) : publicReviews.length >
        0 ? (
          <div className="discovery-review-grid">
            {publicReviews.map(
              (review) => (
                <article
                  className="discovery-review-card"
                  key={
                    review.id
                  }
                >
                  <div className="discovery-review-card-top">
                    <div className="discovery-review-avatar">
                      {(review.reviewer_name ||
                        'R')
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="discovery-review-person">
                      <strong>
                        {review.reviewer_name ||
                          'Reader'}
                      </strong>

                      {review.updated_at && (
                        <span>
                          {formatDate(
                            review.updated_at
                          )}
                        </span>
                      )}
                    </div>

                    <div className="discovery-review-stars">
                      {[1, 2, 3, 4, 5].map(
                        (star) => (
                          <Star
                            key={
                              star
                            }
                            size={16}
                            fill={
                              star <=
                              Number(
                                review.rating ||
                                  0
                              )
                                ? 'currentColor'
                                : 'none'
                            }
                          />
                        )
                      )}
                    </div>
                  </div>

                  {review.review?.trim() ? (
                    <p>
                      {
                        review.review
                      }
                    </p>
                  ) : (
                    <p className="discovery-review-empty-text">
                      Rated this book
                      without a
                      written review.
                    </p>
                  )}
                </article>
              )
            )}
          </div>
        ) : (
          <div className="discovery-reviews-empty">
            <Star
              size={26}
            />

            <h3>
              No public reviews
              yet
            </h3>

            <p>
              Pagelette readers
              haven't shared their
              thoughts on this book
              yet.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/* =====================================================
   BOOK DETAIL
===================================================== */

function BookDetailPage({ user }) {
  const navigate =
    useNavigate()

  const { bookKey } =
    useParams()

  const decodedKey =
    decodeURIComponent(
      bookKey
    )

  const [books, setBooks] =
    useState(loadBooks)

  const [
    bookSummary,
    setBookSummary,
  ] = useState('')

  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(false)

  const [
    reviewVisibility,
    setReviewVisibility,
  ] = useState('private')

  const [
    publicReviews,
    setPublicReviews,
  ] = useState([])

  const [
    reviewsLoading,
    setReviewsLoading,
  ] = useState(false)

  const [
    reviewSaving,
    setReviewSaving,
  ] = useState(false)

  const [
    reviewMessage,
    setReviewMessage,
  ] = useState('')

  const book =
    books.find(
      (savedBook) =>
        savedBook.key ===
        decodedKey
    )

  useEffect(() => {
    saveBooksToStorage(
      books
    )
  }, [books])

  useEffect(() => {
    async function loadBookSummary() {
      if (!decodedKey) {
        return
      }

      setSummaryLoading(true)

      try {
        const normalizedKey =
          decodedKey.startsWith('/')
            ? decodedKey
            : `/${decodedKey}`

        const response =
          await fetch(
            `https://openlibrary.org${normalizedKey}.json`
          )

        if (!response.ok) {
          throw new Error(
            'Could not load book details'
          )
        }

        const data =
          await response.json()

        let description = ''

        if (
          typeof data.description ===
          'string'
        ) {
          description =
            data.description
        } else if (
          data.description?.value
        ) {
          description =
            data.description.value
        }

        setBookSummary(
          description.trim()
        )
      } catch (error) {
        console.error(
          'Error loading book summary:',
          error
        )

        setBookSummary('')
      } finally {
        setSummaryLoading(false)
      }
    }

    loadBookSummary()
  }, [decodedKey])

  useEffect(() => {
    async function loadReaderReviews() {
      if (
        !decodedKey ||
        !user?.id
      ) {
        return
      }

      setReviewsLoading(true)

      try {
        const {
          data,
          error,
        } =
          await supabase
            .from('reviews')
            .select(
              'id, user_id, reviewer_name, book_key, book_title, book_author, rating, review, is_public, created_at, updated_at'
            )
            .eq(
              'book_key',
              decodedKey
            )
            .order(
              'updated_at',
              {
                ascending: false,
              }
            )

        if (error) {
          throw error
        }

        const rows =
          data || []

        const ownReview =
          rows.find(
            (review) =>
              review.user_id ===
              user.id
          )

        if (ownReview) {
          setReviewVisibility(
            ownReview.is_public
              ? 'public'
              : 'private'
          )

          setBooks(
            (currentBooks) =>
              currentBooks.map(
                (savedBook) =>
                  savedBook.key ===
                  decodedKey
                    ? {
                        ...savedBook,

                        review:
                          ownReview.review ||
                          savedBook.review ||
                          '',

                        rating:
                          Number(
                            ownReview.rating
                          ) ||
                          savedBook.rating ||
                          0,

                        reviewUpdatedAt:
                          ownReview.updated_at ||
                          savedBook.reviewUpdatedAt ||
                          '',
                      }
                    : savedBook
              )
          )
        }

        setPublicReviews(
          rows.filter(
            (review) =>
              review.user_id !==
                user.id &&
              review.is_public
          )
        )
      } catch (error) {
        console.error(
          'Error loading reader reviews:',
          error
        )
      } finally {
        setReviewsLoading(false)
      }
    }

    loadReaderReviews()
  }, [decodedKey, user?.id])

  if (!book) {
    return (
      <div className="empty-page-card">
        <BookOpen
          size={40}
        />

        <h3>
          Book not found 
        </h3>

        <p>
          This book may have
          been removed from
          your library.
        </p>

        <button
          className="pink-button"
          onClick={() =>
            navigate('/books')
          }
        >
          Back to My Books
        </button>
      </div>
    )
  }

  function updateBook(
    changes
  ) {
    setBooks(
      (currentBooks) =>
        currentBooks.map(
          (savedBook) =>
            savedBook.key ===
            book.key
              ? {
                  ...savedBook,
                  ...changes,
                }
              : savedBook
        )
    )
  }

  async function saveReview() {
    if (
      !book ||
      !user?.id
    ) {
      return
    }

    setReviewSaving(true)
    setReviewMessage('')

    try {
      const now =
        new Date().toISOString()

      const payload = {
        user_id:
          user.id,

        reviewer_name:
          user.name ||
          'Reader',

        book_key:
          book.key,

        book_title:
          book.title,

        book_author:
          book.author ||
          '',

        rating:
          Number(
            book.rating
          ) || 0,

        review:
          book.review ||
          '',

        is_public:
          reviewVisibility ===
          'public',

        updated_at:
          now,
      }

      const {
        error,
      } =
        await supabase
          .from('reviews')
          .upsert(
            payload,
            {
              onConflict:
                'user_id,book_key',
            }
          )

      if (error) {
        throw error
      }

      updateBook({
        reviewUpdatedAt:
          now,
      })

      setReviewMessage(
        reviewVisibility ===
          'public'
          ? 'Saved — your review is public.'
          : 'Saved — only you can see this review.'
      )
    } catch (error) {
      console.error(
        'Error saving review:',
        error
      )

      setReviewMessage(
        'Could not save your review. Please try again.'
      )
    } finally {
      setReviewSaving(false)
    }
  }

  function addQuote() {
    updateBook({
      quotes: [
        ...(book.quotes ||
          []),

        {
          id:
            Date.now(),

          text: '',

          page: '',

          pinned: false,

          createdAt:
            new Date().toISOString(),

          updatedAt:
            new Date().toISOString(),
        },
      ],
    })
  }

  function updateQuote(
    quoteId,
    changes
  ) {
    updateBook({
      quotes: (
        book.quotes || []
      ).map((quote) =>
        quote.id === quoteId
          ? {
              ...quote,
              ...changes,

              updatedAt:
                new Date().toISOString(),
            }
          : quote
      ),
    })
  }

  function removeQuote(
    quoteId
  ) {
    updateBook({
      quotes: (
        book.quotes || []
      ).filter(
        (quote) =>
          quote.id !==
          quoteId
      ),
    })
  }

  function togglePinnedQuote(
    quoteId
  ) {
    updateBook({
      quotes: (
        book.quotes || []
      ).map((quote) => ({
        ...quote,

        pinned:
          quote.id === quoteId
            ? !quote.pinned
            : false,
      })),
    })
  }

  function handleDetailShelfChange(
    newShelf
  ) {
    const today =
      todayString()

    if (
      newShelf ===
      'Want to Read'
    ) {
      updateBook({
        shelf:
          'Want to Read',

        startedDate: '',

        finishedDate: '',

        pagesRead: '',
      })

      return
    }

    if (
      newShelf ===
      'Currently Reading'
    ) {
      updateBook({
        shelf:
          'Currently Reading',

        startedDate:
          book.startedDate ||
          today,

        finishedDate: '',
      })

      return
    }

    if (
      newShelf ===
      'Finished'
    ) {
      updateBook({
        shelf: 'Finished',

        startedDate:
          book.startedDate ||
          today,

        finishedDate:
          book.finishedDate ||
          today,

        pagesRead:
          Number(
            book.totalPages
          ) > 0
            ? Number(
                book.totalPages
              )
            : book.pagesRead,
      })

      return
    }

    if (
      newShelf === 'DNF'
    ) {
      updateBook({
        shelf: 'DNF',

        startedDate:
          book.startedDate ||
          today,

        finishedDate: '',
      })
    }
  }

  function handleFinishedDate(
    finishedDate
  ) {
    if (!finishedDate) {
      updateBook({
        finishedDate: '',
      })

      return
    }

    updateBook({
      finishedDate,

      shelf: 'Finished',

      startedDate:
        book.startedDate ||
        finishedDate,

      pagesRead:
        Number(
          book.totalPages
        ) > 0
          ? Number(
              book.totalPages
            )
          : book.pagesRead,
    })
  }

  const totalPages =
    Number(
      book.totalPages
    ) || 0

  const pagesRead =
    Number(
      book.pagesRead
    ) || 0

  const percent =
    totalPages > 0
      ? Math.min(
          Math.round(
            (pagesRead /
              totalPages) *
              100
          ),
          100
        )
      : 0

  const readingDays =
    book.startedDate &&
    book.finishedDate
      ? Math.max(
          0,
          Math.round(
            (new Date(
              `${book.finishedDate}T00:00:00`
            ) -
              new Date(
                `${book.startedDate}T00:00:00`
              )) /
              (1000 *
                60 *
                60 *
                24)
          )
        )
      : null

  const daysCurrentlyReading =
    book.startedDate &&
    !book.finishedDate
      ? Math.max(
          0,
          Math.floor(
            (new Date() -
              new Date(
                `${book.startedDate}T00:00:00`
              )) /
              (1000 *
                60 *
                60 *
                24)
          )
        )
      : null

  return (
    <div className="page">
      <button
        className="detail-back-button"
        onClick={() =>
          navigate('/books')
        }
      >
        <ArrowLeft
          size={18}
        />

        Back to My Books
      </button>

      <div className="book-detail-card">
        <div className="book-detail-top">
          <div className="detail-cover">
            {book.cover ? (
              <img
                src={
                  book.cover
                }
                alt={
                  book.title
                }
              />
            ) : (
              <div className="library-missing-cover">
                <BookOpen
                  size={48}
                />
              </div>
            )}
          </div>

          <div className="detail-info">
            <p className="eyebrow">
              your book
            </p>

            <h1>
              {book.title}
            </h1>

            <p className="detail-author">
              {book.author}
            </p>

            {book.year && (
              <p className="detail-year">
                First published{' '}
                {book.year}
              </p>
            )}

            <div className="detail-actions">
              <select
                className="shelf-select"
                value={
                  book.shelf ||
                  'Want to Read'
                }
                onChange={(
                  event
                ) =>
                  handleDetailShelfChange(
                    event.target
                      .value
                  )
                }
              >
                <option value="Want to Read">
                  Want to Read
                </option>

                <option value="Currently Reading">
                  Currently
                  Reading
                </option>

                <option value="Finished">
                  Finished
                </option>

                <option value="DNF">
                  DNF
                </option>
              </select>

              <button
                className={
                  book.favorite
                    ? 'detail-favorite-button favorited'
                    : 'detail-favorite-button'
                }
                onClick={() =>
                  updateBook({
                    favorite:
                      !book.favorite,
                  })
                }
              >
                <Bookmark
                  size={19}
                  fill={
                    book.favorite
                      ? 'currentColor'
                      : 'none'
                  }
                />

                {book.favorite
                  ? 'Favorited'
                  : 'Favorite'}
              </button>
            </div>

            <div className="detail-rating">
              <p>
                Your Rating
              </p>

              <div className="interactive-stars">
                {[1, 2, 3, 4, 5].map(
                  (star) => (
                    <button
                      key={star}
                      onClick={() =>
                        updateBook({
                          rating:
                            star,

                          reviewUpdatedAt:
                            new Date().toISOString(),
                        })
                      }
                    >
                      <Star
                        size={28}
                        fill={
                          star <=
                          (book.rating ||
                            0)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <section className="book-summary-panel">
          <div className="book-summary-heading">
            <h3>
              About This Book
            </h3>

            <span className="spoiler-free-label">
              spoiler-free
            </span>
          </div>

          {summaryLoading ? (
            <div className="summary-loading">
              <BookOpen
                size={22}
              />

              <p>
                Loading summary...
              </p>
            </div>
          ) : bookSummary ? (
            <p className="book-summary-text">
              {bookSummary}
            </p>
          ) : (
            <div className="summary-empty">
              <BookOpen
                size={24}
              />

              <p>
                No summary is
                available for this
                book yet.
              </p>
            </div>
          )}
        </section>

        <div className="detail-sections">
          <section className="detail-panel">
            <h3>
              Reading Dates
            </h3>

            <div className="date-inputs">
              <div>
                <label>
                  Started
                </label>

                <input
                  type="date"
                  value={
                    book.startedDate ||
                    ''
                  }
                  onChange={(
                    event
                  ) =>
                    updateBook({
                      startedDate:
                        event.target
                          .value,
                    })
                  }
                />
              </div>

              <div>
                <label>
                  Finished
                </label>

                <input
                  type="date"
                  value={
                    book.finishedDate ||
                    ''
                  }
                  onChange={(
                    event
                  ) =>
                    handleFinishedDate(
                      event.target
                        .value
                    )
                  }
                />
              </div>
            </div>

            <p className="autosave-text">
              Saved
              automatically 
            </p>
          </section>

          <section className="detail-panel reading-timeline-panel">
            <h3>
              Reading Timeline
              
            </h3>

            {book.startedDate ? (
              <div className="reading-timeline">
                <div className="timeline-item">
                  <div className="timeline-dot"></div>

                  <div>
                    <span>
                      Started
                    </span>

                    <strong>
                      {formatDate(
                        book.startedDate
                      )}
                    </strong>
                  </div>
                </div>

                <div className="timeline-line"></div>

                {book.finishedDate ? (
                  <div className="timeline-item">
                    <div className="timeline-dot finished"></div>

                    <div>
                      <span>
                        Finished
                      </span>

                      <strong>
                        {formatDate(
                          book.finishedDate
                        )}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="timeline-item">
                    <div className="timeline-dot current"></div>

                    <div>
                      <span>
                        Currently
                        reading
                      </span>

                      <strong>
                        Still in
                        progress 
                      </strong>
                    </div>
                  </div>
                )}

                {book.finishedDate &&
                  readingDays !==
                    null && (
                    <div className="reading-days">
                      {readingDays ===
                      0 ? (
                        <span>
                          Finished
                          the same
                          day 
                        </span>
                      ) : (
                        <>
                          <strong>
                            {
                              readingDays
                            }
                          </strong>

                          <span>
                            {readingDays ===
                            1
                              ? 'day'
                              : 'days'}{' '}
                            to
                            finish
                          </span>
                        </>
                      )}
                    </div>
                  )}

                {!book.finishedDate &&
                  daysCurrentlyReading !==
                    null && (
                    <div className="reading-days">
                      {daysCurrentlyReading ===
                      0 ? (
                        <span>
                          Started
                          today 
                        </span>
                      ) : (
                        <>
                          <strong>
                            {
                              daysCurrentlyReading
                            }
                          </strong>

                          <span>
                            {daysCurrentlyReading ===
                            1
                              ? 'day'
                              : 'days'}{' '}
                            reading
                            so far
                          </span>
                        </>
                      )}
                    </div>
                  )}
              </div>
            ) : (
              <div className="timeline-empty">
                <BookOpen
                  size={27}
                />

                <p>
                  Add a started
                  date to begin
                  your reading
                  timeline.
                </p>
              </div>
            )}
          </section>

          <section className="detail-panel">
            <h3>
              Reading Progress
            </h3>

            <div className="progress-inputs">
              <div>
                <label>
                  Pages read
                </label>

                <input
                  type="number"
                  min="0"
                  max={
                    Number(
                      book.totalPages
                    ) ||
                    undefined
                  }
                  value={
                    book.pagesRead ??
                    ''
                  }
                  onChange={(
                    event
                  ) => {
                    const value =
                      event.target
                        .value

                    if (
                      value === ''
                    ) {
                      updateBook({
                        pagesRead:
                          '',
                      })

                      return
                    }

                    let pageNumber =
                      Number(
                        value
                      )

                    if (
                      pageNumber <
                      0
                    ) {
                      pageNumber =
                        0
                    }

                    if (
                      Number(
                        book.totalPages
                      ) > 0 &&
                      pageNumber >
                        Number(
                          book.totalPages
                        )
                    ) {
                      pageNumber =
                        Number(
                          book.totalPages
                        )
                    }

                    updateBook({
                      pagesRead:
                        pageNumber,
                    })
                  }}
                />
              </div>

              <div>
                <label>
                  Total pages
                </label>

                <input
                  type="number"
                  min="0"
                  value={
                    book.totalPages ??
                    ''
                  }
                  onChange={(
                    event
                  ) => {
                    const value =
                      event.target
                        .value

                    if (
                      value === ''
                    ) {
                      updateBook({
                        totalPages:
                          '',
                      })

                      return
                    }

                    const total =
                      Math.max(
                        0,
                        Number(
                          value
                        )
                      )

                    const current =
                      Number(
                        book.pagesRead
                      ) || 0

                    updateBook({
                      totalPages:
                        total,

                      pagesRead:
                        Math.min(
                          current,
                          total
                        ),
                    })
                  }}
                />
              </div>
            </div>

            <div className="detail-progress-row">
              <span>
                {percent}%
                complete
              </span>

              <span>
                {pagesRead}

                {totalPages
                  ? ` / ${totalPages}`
                  : ''}{' '}

                pages
              </span>
            </div>

            <div className="detail-progress-bar">
              <div
                style={{
                  width: `${percent}%`,
                }}
              ></div>
            </div>
          </section>

          <section className="detail-panel review-sharing-panel">
            <div className="detail-panel-title-row">
              <h3>
                My Review
              </h3>

              <span
                className={
                  reviewVisibility ===
                  'public'
                    ? 'review-visibility-badge public'
                    : 'review-visibility-badge private'
                }
              >
                {reviewVisibility ===
                'public'
                  ? 'Public'
                  : 'Private'}
              </span>
            </div>

            <textarea
              className="review-sharing-textarea"
              placeholder="What did you think about this book?"
              value={
                book.review ||
                ''
              }
              onChange={(
                event
              ) => {
                updateBook({
                  review:
                    event.target
                      .value,
                })

                setReviewMessage('')
              }}
            />

            <div className="review-visibility-section">
              <p>
                Who can see this
                review?
              </p>

              <div className="review-visibility-options">
                <button
                  type="button"
                  className={
                    reviewVisibility ===
                    'private'
                      ? 'visibility-option active'
                      : 'visibility-option'
                  }
                  onClick={() => {
                    setReviewVisibility(
                      'private'
                    )

                    setReviewMessage('')
                  }}
                >
                  <span className="visibility-dot"></span>

                  <div>
                    <strong>
                      Private
                    </strong>

                    <small>
                      Only you can see
                      this review
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={
                    reviewVisibility ===
                    'public'
                      ? 'visibility-option active'
                      : 'visibility-option'
                  }
                  onClick={() => {
                    setReviewVisibility(
                      'public'
                    )

                    setReviewMessage('')
                  }}
                >
                  <span className="visibility-dot"></span>

                  <div>
                    <strong>
                      Public
                    </strong>

                    <small>
                      Share with other
                      Pagelette readers
                    </small>
                  </div>
                </button>
              </div>
            </div>

            <div className="review-save-row">
              <p className="review-save-message">
                {reviewMessage}
              </p>

              <button
                type="button"
                className="save-cloud-review-button"
                disabled={
                  reviewSaving
                }
                onClick={
                  saveReview
                }
              >
                {reviewSaving
                  ? 'Saving...'
                  : 'Save Review'}
              </button>
            </div>
          </section>

          <section className="detail-panel reader-reviews-panel">
            <div className="detail-panel-title-row">
              <div>
                <h3>
                  Reader Reviews
                </h3>

                <p className="reader-reviews-subtitle">
                  See what other
                  Pagelette readers
                  thought.
                </p>
              </div>

              {!reviewsLoading && (
                <span className="reader-review-count">
                  {
                    publicReviews.length
                  }{' '}
                  {publicReviews.length ===
                  1
                    ? 'review'
                    : 'reviews'}
                </span>
              )}
            </div>

            {reviewsLoading ? (
              <div className="reader-reviews-empty">
                <p>
                  Loading reviews...
                </p>
              </div>
            ) : publicReviews.length >
            0 ? (
              <div className="reader-reviews-list">
                {publicReviews.map(
                  (review) => (
                    <article
                      className="reader-review-card"
                      key={
                        review.id
                      }
                    >
                      <div className="reader-review-top">
                        <div className="reader-review-avatar">
                          {(review.reviewer_name ||
                            'R')
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="reader-review-user">
                          <strong>
                            {review.reviewer_name ||
                              'Reader'}
                          </strong>

                          <span>
                            {review.updated_at
                              ? formatDate(
                                  review.updated_at
                                )
                              : ''}
                          </span>
                        </div>

                        <div className="reader-review-stars">
                          {[1, 2, 3, 4, 5].map(
                            (
                              star
                            ) => (
                              <Star
                                key={
                                  star
                                }
                                size={
                                  15
                                }
                                fill={
                                  star <=
                                  Number(
                                    review.rating ||
                                      0
                                  )
                                    ? 'currentColor'
                                    : 'none'
                                }
                              />
                            )
                          )}
                        </div>
                      </div>

                      {review.review?.trim() ? (
                        <p className="reader-review-text">
                          {
                            review.review
                          }
                        </p>
                      ) : (
                        <p className="reader-review-text reader-review-no-text">
                          Rated this book
                          without a
                          written review.
                        </p>
                      )}
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="reader-reviews-empty">
                <Star
                  size={24}
                />

                <p>
                  No public reviews
                  yet.
                </p>

                <span>
                  Be the first reader
                  to share your
                  thoughts.
                </span>
              </div>
            )}
          </section>

          <section className="detail-panel quotes-detail-panel">
            <div className="detail-panel-title-row">
              <h3>
                Favorite Quotes
              </h3>

              <button
                className="add-quote-button"
                onClick={
                  addQuote
                }
              >
                + Add Quote
              </button>
            </div>

            {(book.quotes ||
              []).length >
            0 ? (
              <div className="book-quotes-list">
                {(book.quotes ||
                  []).map(
                  (
                    quote,
                    index
                  ) => (
                    <div
                      className="book-quote-editor"
                      key={
                        quote.id
                      }
                    >
                      <div className="quote-editor-number">
                        {
                          index +
                          1
                        }
                      </div>

                      <div className="quote-editor-content">
                        <textarea
                          placeholder="Save a line you never want to forget..."
                          value={
                            quote.text ||
                            ''
                          }
                          onChange={(
                            event
                          ) =>
                            updateQuote(
                              quote.id,
                              {
                                text:
                                  event
                                    .target
                                    .value,
                              }
                            )
                          }
                        />

                        <div className="quote-editor-bottom">
                          <div className="quote-page-input">
                            <label>
                              Page
                            </label>

                            <input
                              type="text"
                              placeholder="e.g. 214"
                              value={
                                quote.page ||
                                ''
                              }
                              onChange={(
                                event
                              ) =>
                                updateQuote(
                                  quote.id,
                                  {
                                    page:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            />
                          </div>

                          <div className="quote-editor-actions">
                            <button
                              className={
                                quote.pinned
                                  ? 'pin-quote-button pinned'
                                  : 'pin-quote-button'
                              }
                              onClick={() =>
                                togglePinnedQuote(
                                  quote.id
                                )
                              }
                            >
                              {quote.pinned
                                ? ' Featured'
                                : ' Feature'}
                            </button>

                            <button
                              className="remove-quote-button"
                              onClick={() =>
                                removeQuote(
                                  quote.id
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="quotes-detail-empty">
                <Quote
                  size={27}
                />

                <p>
                  Save a favorite
                  line from this
                  book 
                </p>

                <button
                  className="pink-button"
                  onClick={
                    addQuote
                  }
                >
                  + Add your
                  first quote
                </button>
              </div>
            )}

            <p className="autosave-text">
              Saved
              automatically 
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   REVIEWS
===================================================== */

function ReviewsPage() {
  const navigate =
    useNavigate()

  const [
    ratingFilter,
    setRatingFilter,
  ] = useState('All')

  const [books] =
    useState(loadBooks)

  const reviewedBooks =
    books
      .filter(
        (book) =>
          book.review?.trim() ||
          Number(
            book.rating
          ) > 0
      )
      .sort((a, b) => {
        const dateA =
          new Date(
            a.reviewUpdatedAt ||
              a.finishedDate ||
              a.startedDate ||
              0
          )

        const dateB =
          new Date(
            b.reviewUpdatedAt ||
              b.finishedDate ||
              b.startedDate ||
              0
          )

        return dateB - dateA
      })

  const filteredReviews =
    reviewedBooks.filter(
      (book) => {
        if (
          ratingFilter ===
          'All'
        ) {
          return true
        }

        return (
          Number(
            book.rating
          ) ===
          Number(
            ratingFilter
          )
        )
      }
    )

  return (
    <div className="page reviews-page">
      <div className="reviews-header">
        <p className="eyebrow">
          my reading diary
        </p>

        <h1>
          Reviews
        </h1>

        <p className="reviews-subtitle">
          Thoughts, feelings &
          questionable opinions.
        </p>
      </div>

      <div className="review-filters">
        <button
          className={
            ratingFilter ===
            'All'
              ? 'review-filter active'
              : 'review-filter'
          }
          onClick={() =>
            setRatingFilter(
              'All'
            )
          }
        >
          All
        </button>

        {[5, 4, 3, 2, 1].map(
          (rating) => (
            <button
              key={rating}
              className={
                Number(
                  ratingFilter
                ) === rating
                  ? 'review-filter active'
                  : 'review-filter'
              }
              onClick={() =>
                setRatingFilter(
                  rating
                )
              }
            >
              <span className="filter-stars">
                {[1, 2, 3, 4, 5].map(
                  (star) => (
                    <Star
                      key={
                        star
                      }
                      size={14}
                      fill={
                        star <=
                        rating
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  )
                )}
              </span>
            </button>
          )
        )}
      </div>

      {filteredReviews.length >
      0 ? (
        <div className="reviews-list">
          {filteredReviews.map(
            (book) => (
              <article
                className="review-card-large"
                key={book.key}
              >
                <div
                  className="review-cover"
                  onClick={() =>
                    navigate(
                      `/books/${encodeURIComponent(
                        book.key
                      )}`
                    )
                  }
                >
                  {book.cover ? (
                    <img
                      src={
                        book.cover
                      }
                      alt={
                        book.title
                      }
                    />
                  ) : (
                    <div className="review-no-cover">
                      <BookOpen
                        size={35}
                      />
                    </div>
                  )}
                </div>

                <div className="review-card-content">
                  <div>
                    <h2
                      onClick={() =>
                        navigate(
                          `/books/${encodeURIComponent(
                            book.key
                          )}`
                        )
                      }
                    >
                      {
                        book.title
                      }
                    </h2>

                    <p className="review-author">
                      {
                        book.author
                      }
                    </p>
                  </div>

                  <div className="review-rating-stars">
                    {[1, 2, 3, 4, 5].map(
                      (star) => (
                        <Star
                          key={
                            star
                          }
                          size={21}
                          fill={
                            star <=
                            Number(
                              book.rating ||
                                0
                            )
                              ? 'currentColor'
                              : 'none'
                          }
                        />
                      )
                    )}
                  </div>

                  {book.review?.trim() ? (
                    <p className="review-body">
                      {
                        book.review
                      }
                    </p>
                  ) : (
                    <p className="review-body review-empty-text">
                      No written
                      review yet 
                    </p>
                  )}

                  <div className="review-card-bottom">
                    <div className="review-status">
                      <span>
                        {book.shelf ||
                          'Finished'}
                      </span>

                      {book.reviewUpdatedAt ? (
                        <>
                          <span className="review-dot">
                            •
                          </span>

                          <span>
                            Reviewed{' '}
                            {formatDate(
                              book.reviewUpdatedAt,
                              true
                            )}
                          </span>
                        </>
                      ) : book.finishedDate ? (
                        <>
                          <span className="review-dot">
                            •
                          </span>

                          <span>
                            Finished{' '}
                            {formatDate(
                              book.finishedDate,
                              true
                            )}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <button
                      className="edit-review-button"
                      onClick={() =>
                        navigate(
                          `/books/${encodeURIComponent(
                            book.key
                          )}`
                        )
                      }
                    >
                      Edit review
                    </button>
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      ) : (
        <div className="empty-reviews">
          <div className="empty-review-heart">
            <Bookmark
              size={31}
            />
          </div>

          <h2>
            No reviews here
            yet 
          </h2>

          <p>
            Rate a book or
            write down your
            thoughts and it'll
            automatically appear
            here.
          </p>

          <button
            className="pink-button"
            onClick={() =>
              navigate(
                '/books'
              )
            }
          >
            Go to My Books
          </button>
        </div>
      )}

      {filteredReviews.length >
        0 && (
        <div className="reviews-end-message">
          <Bookmark
            size={15}
          />

          <span>
            That's all for now!
            Add more reviews as
            you read 
          </span>
        </div>
      )}
    </div>
  )
}

/* =====================================================
   WANT TO READ
===================================================== */

function WantToReadPage() {
  const navigate =
    useNavigate()

  const [books, setBooks] =
    useState(loadBooks)

  const wantToReadBooks =
    books.filter(
      (book) =>
        book.shelf ===
        'Want to Read'
    )

  function saveBooks(
    updatedBooks
  ) {
    setBooks(
      updatedBooks
    )

    saveBooksToStorage(
      updatedBooks
    )
  }

  function removeFromTBR(
    bookKey
  ) {
    saveBooks(
      books.filter(
        (book) =>
          book.key !==
          bookKey
      )
    )
  }

  function startReading(
    bookKey
  ) {
    const today =
      todayString()

    saveBooks(
      books.map((book) =>
        book.key === bookKey
          ? {
              ...book,

              shelf:
                'Currently Reading',

              startedDate:
                book.startedDate ||
                today,

              finishedDate:
                '',
            }
          : book
      )
    )
  }

  return (
    <div className="page want-to-read-page">
      <div className="want-page-header">
        <p className="eyebrow">
          your next reads
        </p>

        <h1>
          Want to Read
        </h1>

        <p>
          All the books
          patiently waiting for
          their turn.
        </p>
      </div>

      <div className="want-summary">
        <div>
          <strong>
            {
              wantToReadBooks.length
            }
          </strong>

          <span>
            books waiting
          </span>
        </div>

        <div>
          <strong>♡</strong>

          <span>
            endless
            possibilities
          </span>
        </div>
      </div>

      {wantToReadBooks.length >
      0 ? (
        <div className="want-library-grid">
          {wantToReadBooks.map(
            (book) => (
              <div
                className="want-book-card"
                key={book.key}
              >
                <div
                  className="want-book-cover"
                  onClick={() =>
                    navigate(
                      `/books/${encodeURIComponent(
                        book.key
                      )}`
                    )
                  }
                >
                  {book.cover ? (
                    <img
                      src={
                        book.cover
                      }
                      alt={
                        book.title
                      }
                    />
                  ) : (
                    <div className="want-missing-cover">
                      <BookOpen
                        size={38}
                      />
                    </div>
                  )}
                </div>

                <div className="want-book-info">
                  <h2
                    onClick={() =>
                      navigate(
                        `/books/${encodeURIComponent(
                          book.key
                        )}`
                      )
                    }
                  >
                    {
                      book.title
                    }
                  </h2>

                  <p>
                    {
                      book.author
                    }
                  </p>

                  {book.year && (
                    <small>
                      First
                      published{' '}
                      {
                        book.year
                      }
                    </small>
                  )}

                  <div className="want-book-actions">
                    <button
                      className="start-reading-button"
                      onClick={() =>
                        startReading(
                          book.key
                        )
                      }
                    >
                      Start Reading
                    </button>

                    <button
                      className="tbr-remove-button"
                      onClick={() =>
                        removeFromTBR(
                          book.key
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="empty-want-page">
          <Bookmark
            size={40}
          />

          <h2>
            Your TBR is empty
            
          </h2>

          <p>
            Add some books from
            My Books and they’ll
            show up here.
          </p>

          <button
            className="pink-button"
            onClick={() =>
              navigate('/books')
            }
          >
            Browse My Books
          </button>
        </div>
      )}
    </div>
  )
}

/* =====================================================
   QUOTES
===================================================== */

function QuotesPage() {
  const navigate =
    useNavigate()

  const [books] =
    useState(loadBooks)

  const allQuotes =
    books.flatMap(
      (book) =>
        (book.quotes || [])
          .filter(
            (quote) =>
              quote.text?.trim()
          )
          .map(
            (quote) => ({
              ...quote,
              book,
            })
          )
    )

  return (
    <div className="page quotes-page">
      <div className="quotes-header">
        <p className="eyebrow">
          favorite lines
        </p>

        <h1>
          Quotes
        </h1>

        <p>
          Little pieces of
          books you never want
          to forget.
        </p>
      </div>

      {allQuotes.length > 0 ? (
        <div className="quotes-grid">
          {allQuotes.map(
            (quote) => (
              <article
                className="saved-quote-card"
                key={`${quote.book.key}-${quote.id}`}
              >
                <Quote
                  size={27}
                  className="saved-quote-icon"
                />

                {quote.pinned && (
                  <span className="featured-quote-badge">
                     Featured
                  </span>
                )}

                <blockquote>
                  “{quote.text}”
                </blockquote>

                {quote.page && (
                  <p className="saved-quote-page">
                    page{' '}
                    {
                      quote.page
                    }
                  </p>
                )}

                <div className="quote-book-info">
                  {quote.book
                    .cover ? (
                    <img
                      src={
                        quote.book
                          .cover
                      }
                      alt={
                        quote.book
                          .title
                      }
                      onClick={() =>
                        navigate(
                          `/books/${encodeURIComponent(
                            quote.book
                              .key
                          )}`
                        )
                      }
                    />
                  ) : (
                    <div className="quote-mini-cover">
                      <BookOpen
                        size={20}
                      />
                    </div>
                  )}

                  <div>
                    <h3
                      onClick={() =>
                        navigate(
                          `/books/${encodeURIComponent(
                            quote.book
                              .key
                          )}`
                        )
                      }
                    >
                      {
                        quote.book
                          .title
                      }
                    </h3>

                    <p>
                      {
                        quote.book
                          .author
                      }
                    </p>
                  </div>
                </div>

                <button
                  className="edit-quote-button"
                  onClick={() =>
                    navigate(
                      `/books/${encodeURIComponent(
                        quote.book
                          .key
                      )}`
                    )
                  }
                >
                  Edit quote
                </button>
              </article>
            )
          )}
        </div>
      ) : (
        <div className="empty-quotes">
          <Quote size={39} />

          <h2>
            No favorite quotes
            yet 
          </h2>

          <p>
            Open one of your
            books and save a
            favorite line. It’ll
            automatically appear
            here.
          </p>

          <button
            className="pink-button"
            onClick={() =>
              navigate('/books')
            }
          >
            Go to My Books
          </button>
        </div>
      )}
    </div>
  )
}

/* =====================================================
   STATS
===================================================== */

function StatsPage() {
  const [books] =
    useState(loadBooks)

  const finishedBooks =
    books.filter(
      (book) =>
        book.shelf ===
        'Finished'
    )

  const currentlyReading =
    books.filter(
      (book) =>
        book.shelf ===
        'Currently Reading'
    )

  const wantToReadBooks =
    books.filter(
      (book) =>
        book.shelf ===
        'Want to Read'
    )

  const dnfBooks =
    books.filter(
      (book) =>
        book.shelf === 'DNF'
    )

  const favoriteBooks =
    books.filter(
      (book) =>
        book.favorite
    )

  const ratedBooks =
    books.filter(
      (book) =>
        Number(
          book.rating
        ) > 0
    )

  const averageRating =
    ratedBooks.length > 0
      ? (
          ratedBooks.reduce(
            (
              total,
              book
            ) =>
              total +
              Number(
                book.rating ||
                  0
              ),
            0
          ) /
          ratedBooks.length
        ).toFixed(1)
      : '0.0'

  const totalPagesRead =
    books.reduce(
      (total, book) =>
        total +
        Number(
          book.pagesRead ||
            0
        ),
      0
    )

  const totalReviews =
    books.filter(
      (book) =>
        book.review?.trim()
    ).length

  const totalQuotes =
    books.reduce(
      (total, book) =>
        total +
        (book.quotes || [])
          .filter(
            (quote) =>
              quote.text?.trim()
          )
          .length,
      0
    )

  const shelfStats = [
    {
      label: 'Finished',
      count:
        finishedBooks.length,
    },

    {
      label:
        'Currently Reading',
      count:
        currentlyReading.length,
    },

    {
      label:
        'Want to Read',
      count:
        wantToReadBooks.length,
    },

    {
      label: 'DNF',
      count:
        dnfBooks.length,
    },
  ]

  const maxShelfCount =
    Math.max(
      ...shelfStats.map(
        (item) =>
          item.count
      ),
      1
    )

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  const finishedByMonth =
    monthNames.map(
      (month, index) => {
        const count =
          books.filter(
            (book) => {
              if (
                !book.finishedDate
              ) {
                return false
              }

              const date =
                new Date(
                  `${book.finishedDate}T00:00:00`
                )

              return (
                date.getFullYear() ===
                  2026 &&
                date.getMonth() ===
                  index
              )
            }
          ).length

        return {
          month,
          count,
        }
      }
    )

  const maxMonthlyFinished =
    Math.max(
      ...finishedByMonth.map(
        (item) =>
          item.count
      ),
      1
    )

  return (
    <div className="page stats-page">
      <div className="stats-page-header">
        <p className="eyebrow">
          your reading life
        </p>

        <h1>
          Reading Stats
        </h1>

        <p>
          A little look at your
          reading habits so far.
        </p>
      </div>

      <div className="stats-overview-grid">
        <div className="stat-big-card">
          <span className="stat-label">
            Total Books
          </span>

          <strong>
            {books.length}
          </strong>
        </div>

        <div className="stat-big-card">
          <span className="stat-label">
            Finished
          </span>

          <strong>
            {
              finishedBooks.length
            }
          </strong>
        </div>

        <div className="stat-big-card">
          <span className="stat-label">
            Pages Read
          </span>

          <strong>
            {totalPagesRead.toLocaleString()}
          </strong>
        </div>

        <div className="stat-big-card">
          <span className="stat-label">
            Avg. Rating
          </span>

          <strong>
            {
              averageRating
            }
          </strong>
        </div>
      </div>

      <div className="stats-secondary-grid">
        <div className="stats-panel">
          <div className="stats-panel-heading">
            <h2>
              Your Shelves
            </h2>

            <BookOpen
              size={21}
            />
          </div>

          <div className="shelf-chart">
            {shelfStats.map(
              (item) => (
                <div
                  className="shelf-chart-row"
                  key={
                    item.label
                  }
                >
                  <div className="shelf-chart-label">
                    <span>
                      {
                        item.label
                      }
                    </span>

                    <strong>
                      {
                        item.count
                      }
                    </strong>
                  </div>

                  <div className="shelf-chart-track">
                    <div
                      className="shelf-chart-fill"
                      style={{
                        width: `${
                          (item.count /
                            maxShelfCount) *
                          100
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-panel-heading">
            <h2>
              Little
              Milestones 
            </h2>

            <Bookmark size={21} />
          </div>

          <div className="milestone-grid">
            <div>
              <strong>
                {
                  favoriteBooks.length
                }
              </strong>

              <span>
                favorites
              </span>
            </div>

            <div>
              <strong>
                {
                  totalReviews
                }
              </strong>

              <span>
                reviews
              </span>
            </div>

            <div>
              <strong>
                {
                  totalQuotes
                }
              </strong>

              <span>
                saved quotes
              </span>
            </div>

            <div>
              <strong>
                {
                  currentlyReading.length
                }
              </strong>

              <span>
                reading now
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-panel monthly-stats-panel">
        <div className="stats-panel-heading">
          <h2>
            Books Finished by
            Month
          </h2>

          <BarChart3
            size={21}
          />
        </div>

        <div className="monthly-finished-chart">
          {finishedByMonth.map(
            (item) => (
              <div
                className="monthly-finished-column"
                key={
                  item.month
                }
              >
                <div className="monthly-bar-area">
                  {item.count >
                    0 && (
                    <span className="monthly-bar-number">
                      {
                        item.count
                      }
                    </span>
                  )}

                  <div
                    className="monthly-finished-bar"
                    style={{
                      height: `${
                        item.count ===
                        0
                          ? 4
                          : Math.max(
                              (item.count /
                                maxMonthlyFinished) *
                                120,
                              18
                            )
                      }px`,
                    }}
                  ></div>
                </div>

                <span className="monthly-label">
                  {
                    item.month
                  }
                </span>
              </div>
            )
          )}
        </div>

        <p className="monthly-chart-note">
          Based on the finished
          dates you save on each
          book 
        </p>
      </div>

      <div className="stats-panel rating-panel">
        <div className="stats-panel-heading">
          <h2>
            Rating Breakdown
          </h2>

          <Star size={21} />
        </div>

        <div className="rating-breakdown">
          {[5, 4, 3, 2, 1].map(
            (rating) => {
              const count =
                books.filter(
                  (book) =>
                    Number(
                      book.rating
                    ) === rating
                ).length

              const percentage =
                ratedBooks.length >
                0
                  ? (count /
                      ratedBooks.length) *
                    100
                  : 0

              return (
                <div
                  className="rating-row"
                  key={
                    rating
                  }
                >
                  <div className="rating-row-label">
                    <span>
                      {rating}
                    </span>

                    <Star
                      size={14}
                      fill="currentColor"
                    />
                  </div>

                  <div className="rating-track">
                    <div
                      className="rating-fill"
                      style={{
                        width: `${percentage}%`,
                      }}
                    ></div>
                  </div>

                  <span className="rating-count">
                    {count}
                  </span>
                </div>
              )
            }
          )}
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   ROUTES
===================================================== */

function App() {
  const [
    user,
    setUser,
  ] = useState(null)

  const [
    authLoading,
    setAuthLoading,
  ] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const {
        data,
      } =
        await supabase.auth
          .getSession()

      if (!mounted) {
        return
      }

      const currentUser =
        userFromSupabase(
          data.session?.user
        )

      if (currentUser) {
        localStorage.setItem(
          ACTIVE_USER_KEY,
          currentUser.id
        )
      } else {
        localStorage.removeItem(
          ACTIVE_USER_KEY
        )
      }

      setUser(
        currentUser
      )

      setAuthLoading(
        false
      )
    }

    loadSession()

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth
        .onAuthStateChange(
          (
            _event,
            session
          ) => {
            const currentUser =
              userFromSupabase(
                session?.user
              )

            if (
              currentUser
            ) {
              localStorage.setItem(
                ACTIVE_USER_KEY,
                currentUser.id
              )
            } else {
              localStorage.removeItem(
                ACTIVE_USER_KEY
              )
            }

            setUser(
              currentUser
            )

            setAuthLoading(
              false
            )
          }
        )

    return () => {
      mounted = false

      subscription
        .unsubscribe()
    }
  }, [])

  async function handleLogout() {
    const {
      error,
    } =
      await supabase.auth
        .signOut()

    if (error) {
      console.error(
        'Logout error:',
        error
      )
    }
  }

  if (authLoading) {
    return (
      <div className="auth-loading-page">
        <div className="auth-loading-mark">
          <BookOpen
            size={26}
          />
        </div>

        <p>
          Opening your bookshelf...
        </p>
      </div>
    )
  }

  if (!user) {
    return (
      <LoginPage />
    )
  }

  return (
    <Layout
      user={user}
      onLogout={
        handleLogout
      }
    >
      <Routes>
        <Route
          path="/"
          element={
            <HomePage user={user} />
          }
        />

        <Route
          path="/books"
          element={
            <MyBooksPage />
          }
        />

        <Route
          path="/discover/:bookKey"
          element={
            <DiscoveryBookPage
              user={user}
            />
          }
        />

        <Route
          path="/books/:bookKey"
          element={
            <BookDetailPage
              user={user}
            />
          }
        />

        <Route
          path="/reviews"
          element={
            <ReviewsPage />
          }
        />

        <Route
          path="/want-to-read"
          element={
            <WantToReadPage />
          }
        />

        <Route
          path="/quotes"
          element={
            <QuotesPage />
          }
        />

        <Route
          path="/stats"
          element={
            <StatsPage />
          }
        />
      </Routes>
    </Layout>
  )
}

export default App