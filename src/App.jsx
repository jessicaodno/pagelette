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
  UserRound,
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

function cloudRowToBook(
  row,
  localBook = null
) {
  return normalizeBook({
    ...(localBook || {}),

    key:
      row.book_key,

    title:
      row.title,

    author:
      row.author ||
      localBook?.author ||
      'Unknown author',

    cover:
      row.cover ||
      localBook?.cover ||
      null,

    year:
      row.publish_year ||
      localBook?.year ||
      null,

    shelf:
      row.shelf ||
      'Want to Read',

    favorite:
      Boolean(
        row.favorite
      ),

    rating:
      Number(
        row.rating
      ) || 0,

    pagesRead:
      row.pages_read ??
      '',

    totalPages:
      row.total_pages ??
      localBook?.totalPages ??
      '',

    startedDate:
      row.started_date ||
      '',

    finishedDate:
      row.finished_date ||
      '',

    // Reviews and quotes already have their own Pagelette
    // storage/features, so keep any local copies intact.
    review:
      localBook?.review ||
      '',

    reviewUpdatedAt:
      localBook?.reviewUpdatedAt ||
      '',

    quotes:
      localBook?.quotes ||
      [],
  })
}

async function upsertBooksToCloud(
  userId,
  books
) {
  if (!userId) {
    return
  }

  const rows =
    books.map((book) => ({
      user_id:
        userId,

      book_key:
        book.key,

      title:
        book.title,

      author:
        book.author ||
        '',

      cover:
        book.cover ||
        null,

      publish_year:
        book.year
          ? Number(
              book.year
            ) || null
          : null,

      shelf:
        book.shelf ||
        'Want to Read',

      favorite:
        Boolean(
          book.favorite
        ),

      rating:
        Number(
          book.rating
        ) || 0,

      pages_read:
        Number(
          book.pagesRead
        ) || 0,

      total_pages:
        book.totalPages ===
          '' ||
        book.totalPages == null
          ? null
          : Number(
              book.totalPages
            ) || null,

      started_date:
        book.startedDate ||
        null,

      finished_date:
        book.finishedDate ||
        null,

      updated_at:
        new Date()
          .toISOString(),
    }))

  if (rows.length > 0) {
    const { error } =
      await supabase
        .from('user_books')
        .upsert(
          rows,
          {
            onConflict:
              'user_id,book_key',
          }
        )

    if (error) {
      throw error
    }
  }
}

async function syncCloudSnapshot(
  userId,
  books
) {
  if (!userId) {
    return
  }

  try {
    await upsertBooksToCloud(
      userId,
      books
    )

    const {
      data: cloudRows,
      error: loadError,
    } =
      await supabase
        .from('user_books')
        .select(
          'book_key'
        )
        .eq(
          'user_id',
          userId
        )

    if (loadError) {
      throw loadError
    }

    const localKeys =
      new Set(
        books.map(
          (book) =>
            book.key
        )
      )

    const removedKeys =
      (cloudRows || [])
        .map(
          (row) =>
            row.book_key
        )
        .filter(
          (bookKey) =>
            !localKeys.has(
              bookKey
            )
        )

    for (
      const bookKey of
      removedKeys
    ) {
      const { error } =
        await supabase
          .from('user_books')
          .delete()
          .eq(
            'user_id',
            userId
          )
          .eq(
            'book_key',
            bookKey
          )

      if (error) {
        throw error
      }
    }
  } catch (error) {
    console.error(
      'Cloud library sync error:',
      error
    )
  }
}

async function hydrateLibraryFromCloud(
  userId
) {
  if (!userId) {
    return
  }

  const localBooks =
    loadBooks()

  try {
    const {
      data: cloudRows,
      error,
    } =
      await supabase
        .from('user_books')
        .select('*')
        .eq(
          'user_id',
          userId
        )
        .order(
          'created_at',
          {
            ascending: true,
          }
        )

    if (error) {
      throw error
    }

    const rows =
      cloudRows || []

    // First migration: this account has browser books but
    // no cloud library yet. Upload without deleting anything.
    if (
      rows.length === 0 &&
      localBooks.length > 0
    ) {
      await upsertBooksToCloud(
        userId,
        localBooks
      )

      return
    }

    if (rows.length === 0) {
      return
    }

    const localByKey =
      new Map(
        localBooks.map(
          (book) => [
            book.key,
            book,
          ]
        )
      )

    const cloudBooks =
      rows.map((row) =>
        cloudRowToBook(
          row,
          localByKey.get(
            row.book_key
          ) || null
        )
      )

    const cloudKeys =
      new Set(
        cloudBooks.map(
          (book) =>
            book.key
        )
      )

    // Preserve books that exist only in this browser, then
    // upload them so neither device loses anything.
    const localOnlyBooks =
      localBooks.filter(
        (book) =>
          !cloudKeys.has(
            book.key
          )
      )

    const mergedBooks = [
      ...cloudBooks,
      ...localOnlyBooks,
    ]

    localStorage.setItem(
      scopedStorageKey(
        'jessicasBooks'
      ),
      JSON.stringify(
        mergedBooks
      )
    )

    if (
      localOnlyBooks.length > 0
    ) {
      await upsertBooksToCloud(
        userId,
        localOnlyBooks
      )
    }

    window.dispatchEvent(
      new Event(
        'booksUpdated'
      )
    )
  } catch (error) {
    console.error(
      'Could not load cloud library:',
      error
    )
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

  const userId =
    localStorage.getItem(
      ACTIVE_USER_KEY
    )

  if (userId) {
    // Keep the UI instant; cloud syncing happens in the
    // background after the browser copy has been saved.
    void syncCloudSnapshot(
      userId,
      books
    )
  }
}

async function createActivity(
  userId,
  activityType,
  book,
  metadata = {}
) {
  if (
    !userId ||
    !activityType ||
    !book?.key
  ) {
    return
  }

  try {
    const {
      error,
    } =
      await supabase
        .from('activities')
        .insert({
          user_id:
            userId,

          activity_type:
            activityType,

          book_key:
            book.key,

          book_title:
            book.title ||
            'Untitled',

          metadata: {
            author:
              book.author ||
              '',

            cover:
              book.cover ||
              null,

            rating:
              Number(
                book.rating
              ) || 0,

            ...metadata,
          },
        })

    if (error) {
      throw error
    }
  } catch (error) {
    console.error(
      'Could not save activity:',
      error
    )
  }
}

async function hydrateReviewsWithLikes(
  reviews,
  userId
) {
  const cleanReviews =
    Array.isArray(reviews)
      ? reviews
      : []

  if (
    cleanReviews.length ===
    0
  ) {
    return []
  }

  const reviewIds =
    cleanReviews.map(
      (review) =>
        review.id
    )

  const reviewerIds =
    Array.from(
      new Set(
        cleanReviews
          .map(
            (review) =>
              review.user_id
          )
          .filter(Boolean)
      )
    )

  try {
    const [
      likesResult,
      profilesResult,
    ] =
      await Promise.all([
        supabase
          .from('review_likes')
          .select(
            'review_id, user_id'
          )
          .in(
            'review_id',
            reviewIds
          ),

        reviewerIds.length > 0
          ? supabase
              .from('profiles')
              .select(
                'id, display_name, username, avatar_url'
              )
              .in(
                'id',
                reviewerIds
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),
      ])

    if (
      likesResult.error
    ) {
      throw (
        likesResult.error
      )
    }

    if (
      profilesResult.error
    ) {
      throw (
        profilesResult.error
      )
    }

    const likes =
      likesResult.data ||
      []

    const profiles =
      new Map(
        (
          profilesResult.data ||
          []
        ).map(
          (profile) => [
            profile.id,
            profile,
          ]
        )
      )

    return cleanReviews.map(
      (review) => {
        const reviewLikes =
          likes.filter(
            (like) =>
              like.review_id ===
              review.id
          )

        const reviewerProfile =
          profiles.get(
            review.user_id
          )

        return {
          ...review,

          reviewer_name:
            reviewerProfile
              ?.display_name ||
            review.reviewer_name ||
            reviewerProfile
              ?.username ||
            'Reader',

          reviewer_avatar_url:
            reviewerProfile
              ?.avatar_url ||
            '',

          like_count:
            reviewLikes.length,

          is_liked:
            Boolean(
              userId &&
              reviewLikes.some(
                (like) =>
                  like.user_id ===
                  userId
              )
            ),
        }
      }
    )
  } catch (error) {
    console.error(
      'Could not load review likes or reviewer profiles:',
      error
    )

    return cleanReviews.map(
      (review) => ({
        ...review,

        reviewer_avatar_url:
          '',

        like_count: 0,

        is_liked: false,
      })
    )
  }
}

async function setReviewLike(
  reviewId,
  userId,
  shouldLike
) {
  if (
    !reviewId ||
    !userId
  ) {
    return false
  }

  try {
    if (shouldLike) {
      const {
        error,
      } =
        await supabase
          .from('review_likes')
          .insert({
            review_id:
              reviewId,

            user_id:
              userId,
          })

      if (error) {
        throw error
      }
    } else {
      const {
        error,
      } =
        await supabase
          .from('review_likes')
          .delete()
          .eq(
            'review_id',
            reviewId
          )
          .eq(
            'user_id',
            userId
          )

      if (error) {
        throw error
      }
    }

    return true
  } catch (error) {
    console.error(
      'Could not update review like:',
      error
    )

    return false
  }
}

function activityTypeForShelf(
  shelf
) {
  if (
    shelf ===
    'Currently Reading'
  ) {
    return 'started'
  }

  if (
    shelf ===
    'Finished'
  ) {
    return 'finished'
  }

  if (
    shelf ===
    'Want to Read'
  ) {
    return 'want_to_read'
  }

  if (shelf === 'DNF') {
    return 'dnf'
  }

  return null
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

  const [
    ownAvatarUrl,
    setOwnAvatarUrl,
  ] = useState('')

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

  useEffect(() => {
    let cancelled = false

    async function loadOwnAvatar() {
      if (!user?.id) {
        setOwnAvatarUrl('')
        return
      }

      try {
        const {
          data,
          error,
        } =
          await supabase
            .from('profiles')
            .select(
              'avatar_url'
            )
            .eq(
              'id',
              user.id
            )
            .maybeSingle()

        if (error) {
          throw error
        }

        if (!cancelled) {
          setOwnAvatarUrl(
            data?.avatar_url ||
            ''
          )
        }
      } catch (error) {
        console.error(
          'Could not load profile avatar:',
          error
        )
      }
    }

    loadOwnAvatar()

    function handleProfileUpdated(
      event
    ) {
      if (
        event.detail?.userId ===
        user?.id
      ) {
        setOwnAvatarUrl(
          event.detail
            ?.avatarUrl ||
          ''
        )
      } else {
        loadOwnAvatar()
      }
    }

    window.addEventListener(
      'profileUpdated',
      handleProfileUpdated
    )

    return () => {
      cancelled = true

      window.removeEventListener(
        'profileUpdated',
        handleProfileUpdated
      )
    }
  }, [user?.id])

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
      ? books
          .filter(
            (book) =>
              book.title
                ?.toLowerCase()
                .includes(query)
          )
          .sort(
            (a, b) => {
              const aTitle =
                a.title
                  ?.toLowerCase() ||
                ''

              const bTitle =
                b.title
                  ?.toLowerCase() ||
                ''

              const aStarts =
                aTitle.startsWith(
                  query
                )

              const bStarts =
                bTitle.startsWith(
                  query
                )

              if (
                aStarts &&
                !bStarts
              ) {
                return -1
              }

              if (
                !aStarts &&
                bStarts
              ) {
                return 1
              }

              return aTitle.localeCompare(
                bTitle
              )
            }
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
  {ownAvatarUrl ? (
    <img
      className="avatar-image"
      src={
        ownAvatarUrl
      }
      alt={
        user.name ||
        'Profile'
      }
    />
  ) : (
    <span className="avatar-letter">
      {user.name
        .charAt(0)
        .toUpperCase()}
    </span>
  )}
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
                    onClick={() => {
                      setShowProfileMenu(
                        false
                      )

                      navigate(
                        '/profile'
                      )
                    }}
                  >
                    View profile
                  </button>

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

  const [
    followingActivity,
    setFollowingActivity,
  ] = useState([])

  const [
    followingActivityLoading,
    setFollowingActivityLoading,
  ] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadFollowingActivity() {
      if (!user?.id) {
        return
      }

      setFollowingActivityLoading(
        true
      )

      try {
        const {
          data:
            followRows,
          error:
            followsError,
        } =
          await supabase
            .from('follows')
            .select(
              'following_id'
            )
            .eq(
              'follower_id',
              user.id
            )

        if (followsError) {
          throw followsError
        }

        const followingIds =
          (followRows || [])
            .map(
              (row) =>
                row.following_id
            )
            .filter(Boolean)

        if (
          followingIds.length ===
          0
        ) {
          if (!cancelled) {
            setFollowingActivity(
              []
            )
          }

          return
        }

        const [
          activityResult,
          profileResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'activities'
              )
              .select(
                'id, user_id, activity_type, book_key, book_title, metadata, created_at'
              )
              .in(
                'user_id',
                followingIds
              )
              .order(
                'created_at',
                {
                  ascending:
                    false,
                }
              )
              .limit(12),

            supabase
              .from(
                'profiles'
              )
              .select(
                'id, username, display_name, avatar_url'
              )
              .in(
                'id',
                followingIds
              ),
          ])

        if (
          activityResult.error
        ) {
          throw (
            activityResult.error
          )
        }

        if (
          profileResult.error
        ) {
          throw (
            profileResult.error
          )
        }

        const profiles =
          new Map(
            (
              profileResult.data ||
              []
            ).map(
              (profile) => [
                profile.id,
                profile,
              ]
            )
          )

        const merged =
          (
            activityResult.data ||
            []
          ).map(
            (activity) => ({
              ...activity,

              profile:
                profiles.get(
                  activity.user_id
                ) ||
                null,
            })
          )

        if (!cancelled) {
          setFollowingActivity(
            merged
          )
        }
      } catch (error) {
        console.error(
          'Could not load following activity:',
          error
        )

        if (!cancelled) {
          setFollowingActivity(
            []
          )
        }
      } finally {
        if (!cancelled) {
          setFollowingActivityLoading(
            false
          )
        }
      }
    }

    loadFollowingActivity()

    return () => {
      cancelled = true
    }
  }, [user?.id])

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

  function followingActivityText(
    activity
  ) {
    const name =
      activity.profile
        ?.display_name ||
      activity.profile
        ?.username ||
      'A reader'

    const title =
      activity.book_title ||
      'a book'

    if (
      activity.activity_type ===
      'started'
    ) {
      return `${name} started reading ${title}`
    }

    if (
      activity.activity_type ===
      'finished'
    ) {
      return `${name} finished ${title}`
    }

    if (
      activity.activity_type ===
      'want_to_read'
    ) {
      return `${name} added ${title} to Want to Read`
    }

    if (
      activity.activity_type ===
      'reviewed'
    ) {
      return `${name} reviewed ${title}`
    }

    if (
      activity.activity_type ===
      'dnf'
    ) {
      return `${name} marked ${title} as DNF`
    }

    return `${name} updated ${title}`
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

      <section className="following-feed-card">
        <div className="following-feed-heading">
          <div>
            <p className="eyebrow">
              your reading circle
            </p>

            <h2>
              Following Activity
            </h2>
          </div>

          <span>
            updates from readers
            you follow
          </span>
        </div>

        {followingActivityLoading ? (
          <div className="following-feed-empty">
            <BookOpen
              size={25}
            />

            <p>
              Loading your reading
              circle...
            </p>
          </div>
        ) : followingActivity.length >
        0 ? (
          <div className="following-feed-list">
            {followingActivity.map(
              (activity) => {
                const name =
                  activity.profile
                    ?.display_name ||
                  activity.profile
                    ?.username ||
                  'Reader'

                const initial =
                  name
                    .charAt(0)
                    .toUpperCase()

                return (
                  <article
                    className="following-feed-item"
                    key={
                      activity.id
                    }
                  >
                    <button
                      type="button"
                      className="following-feed-avatar"
                      onClick={() =>
                        navigate(
                          `/profile/${activity.user_id}`
                        )
                      }
                    >
                      {activity.profile
                        ?.avatar_url ? (
                        <img
                          src={
                            activity
                              .profile
                              .avatar_url
                          }
                          alt={
                            name
                          }
                        />
                      ) : (
                        <span>
                          {
                            initial
                          }
                        </span>
                      )}
                    </button>

                    <div className="following-feed-copy">
                      <button
                        type="button"
                        className="following-feed-text"
                        onClick={() =>
                          navigate(
                            `/discover/${encodeURIComponent(
                              activity.book_key
                            )}`
                          )
                        }
                      >
                        {followingActivityText(
                          activity
                        )}
                      </button>

                      <span>
                        {formatDate(
                          activity.created_at
                        )}
                      </span>
                    </div>

                    {activity.activity_type ===
                      'reviewed' &&
                      Number(
                        activity
                          .metadata
                          ?.rating
                      ) > 0 && (
                        <div className="following-feed-stars">
                          {[1, 2, 3, 4, 5].map(
                            (
                              star
                            ) => (
                              <Star
                                key={
                                  star
                                }
                                size={
                                  13
                                }
                                fill={
                                  star <=
                                  Number(
                                    activity
                                      .metadata
                                      ?.rating ||
                                      0
                                  )
                                    ? 'currentColor'
                                    : 'none'
                                }
                              />
                            )
                          )}
                        </div>
                      )}
                  </article>
                )
              }
            )}
          </div>
        ) : (
          <div className="following-feed-empty">
            <UserRound
              size={26}
            />

            <h3>
              Your reading circle
              is quiet
            </h3>

            <p>
              Follow other Pagelette
              readers to see what
              they're reading here.
            </p>
          </div>
        )}
      </section>
    </>
  )
}

/* =====================================================
   MY BOOKS
===================================================== */

function MyBooksPage({ user }) {
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

  const [
    customShelves,
    setCustomShelves,
  ] = useState([])

  const [
    customShelfBooks,
    setCustomShelfBooks,
  ] = useState([])

  const [
    newShelfName,
    setNewShelfName,
  ] = useState('')

  const [
    shelfSaving,
    setShelfSaving,
  ] = useState(false)

  const [
    shelfMessage,
    setShelfMessage,
  ] = useState('')

  useEffect(() => {
    saveBooksToStorage(
      myBooks
    )
  }, [myBooks])

  useEffect(() => {
    let cancelled = false

    async function loadCustomShelves() {
      if (!user?.id) {
        return
      }

      try {
        const [
          shelvesResult,
          shelfBooksResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'custom_shelves'
              )
              .select(
                'id, name, created_at'
              )
              .eq(
                'user_id',
                user.id
              )
              .order(
                'created_at',
                {
                  ascending:
                    true,
                }
              ),

            supabase
              .from(
                'custom_shelf_books'
              )
              .select(
                'id, shelf_id, book_key, created_at'
              )
              .eq(
                'user_id',
                user.id
              ),
          ])

        if (
          shelvesResult.error
        ) {
          throw (
            shelvesResult.error
          )
        }

        if (
          shelfBooksResult.error
        ) {
          throw (
            shelfBooksResult.error
          )
        }

        if (!cancelled) {
          setCustomShelves(
            shelvesResult.data ||
            []
          )

          setCustomShelfBooks(
            shelfBooksResult.data ||
            []
          )
        }
      } catch (error) {
        console.error(
          'Could not load custom shelves:',
          error
        )

        if (!cancelled) {
          setShelfMessage(
            'Could not load your custom shelves.'
          )
        }
      }
    }

    loadCustomShelves()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  async function searchBooks(
    searchTerm = query,
    signal
  ) {
    const cleanQuery =
      searchTerm.trim()

    if (
      cleanQuery.length < 2
    ) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const response =
        await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(
            cleanQuery
          )}&limit=8`,
          {
            signal,
          }
        )

      if (!response.ok) {
        throw new Error(
          'Search failed'
        )
      }

      const data =
        await response.json()

      setResults(
        data.docs || []
      )
    } catch (error) {
      if (
        error.name !==
        'AbortError'
      ) {
        console.error(
          'Error searching books:',
          error
        )
      }
    } finally {
      if (
        !signal?.aborted
      ) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const cleanQuery =
      query.trim()

    if (
      !showAddBook ||
      cleanQuery.length < 2
    ) {
      setResults([])
      setLoading(false)
      return
    }

    const controller =
      new AbortController()

    const timer =
      setTimeout(() => {
        searchBooks(
          cleanQuery,
          controller.signal
        )
      }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    query,
    showAddBook,
  ])

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

    createActivity(
      user?.id,
      'want_to_read',
      newBook,
      {
        shelf:
          'Want to Read',
      }
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
    const previousBook =
      myBooks.find(
        (book) =>
          book.key ===
          bookKey
      )

    if (
      previousBook &&
      previousBook.shelf !==
        shelf
    ) {
      const activityType =
        activityTypeForShelf(
          shelf
        )

      if (activityType) {
        createActivity(
          user?.id,
          activityType,
          {
            ...previousBook,
            shelf,
          },
          {
            shelf,
          }
        )
      }
    }

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

  async function createCustomShelf() {
    const cleanName =
      newShelfName.trim()

    if (
      !user?.id ||
      !cleanName
    ) {
      return
    }

    if (
      customShelves.some(
        (shelf) =>
          shelf.name
            .toLowerCase() ===
          cleanName
            .toLowerCase()
      )
    ) {
      setShelfMessage(
        'You already have a shelf with that name.'
      )

      return
    }

    setShelfSaving(true)
    setShelfMessage('')

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'custom_shelves'
          )
          .insert({
            user_id:
              user.id,

            name:
              cleanName,
          })
          .select(
            'id, name, created_at'
          )
          .single()

      if (error) {
        throw error
      }

      setCustomShelves(
        (current) => [
          ...current,
          data,
        ]
      )

      setNewShelfName('')

      setShelfMessage(
        `Created "${cleanName}".`
      )
    } catch (error) {
      console.error(
        'Could not create custom shelf:',
        error
      )

      setShelfMessage(
        'Could not create that shelf.'
      )
    } finally {
      setShelfSaving(false)
    }
  }

  async function renameCustomShelf(
    shelf
  ) {
    const nextName =
      window.prompt(
        'Rename shelf',
        shelf.name
      )

    if (nextName === null) {
      return
    }

    const cleanName =
      nextName.trim()

    if (
      !cleanName ||
      cleanName ===
        shelf.name
    ) {
      return
    }

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'custom_shelves'
          )
          .update({
            name:
              cleanName,
          })
          .eq(
            'id',
            shelf.id
          )
          .eq(
            'user_id',
            user.id
          )
          .select(
            'id, name, created_at'
          )
          .single()

      if (error) {
        throw error
      }

      setCustomShelves(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              shelf.id
                ? data
                : item
          )
      )

      setShelfMessage(
        `Renamed to "${cleanName}".`
      )
    } catch (error) {
      console.error(
        'Could not rename custom shelf:',
        error
      )

      setShelfMessage(
        'Could not rename that shelf.'
      )
    }
  }

  async function deleteCustomShelf(
    shelf
  ) {
    const confirmed =
      window.confirm(
        `Delete "${shelf.name}"? The books will stay in your library.`
      )

    if (!confirmed) {
      return
    }

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'custom_shelves'
          )
          .delete()
          .eq(
            'id',
            shelf.id
          )
          .eq(
            'user_id',
            user.id
          )

      if (error) {
        throw error
      }

      setCustomShelves(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              shelf.id
          )
      )

      setCustomShelfBooks(
        (current) =>
          current.filter(
            (item) =>
              item.shelf_id !==
              shelf.id
          )
      )

      if (
        activeShelf ===
        `custom:${shelf.id}`
      ) {
        setActiveShelf(
          'All'
        )
      }

      setShelfMessage(
        `Deleted "${shelf.name}".`
      )
    } catch (error) {
      console.error(
        'Could not delete custom shelf:',
        error
      )

      setShelfMessage(
        'Could not delete that shelf.'
      )
    }
  }

  async function addBookToCustomShelf(
    bookKey,
    shelfId
  ) {
    if (
      !user?.id ||
      !bookKey ||
      !shelfId
    ) {
      return
    }

    const exists =
      customShelfBooks.some(
        (item) =>
          item.shelf_id ===
            shelfId &&
          item.book_key ===
            bookKey
      )

    if (exists) {
      return
    }

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'custom_shelf_books'
          )
          .insert({
            shelf_id:
              shelfId,

            user_id:
              user.id,

            book_key:
              bookKey,
          })
          .select(
            'id, shelf_id, book_key, created_at'
          )
          .single()

      if (error) {
        throw error
      }

      setCustomShelfBooks(
        (current) => [
          ...current,
          data,
        ]
      )
    } catch (error) {
      console.error(
        'Could not add book to custom shelf:',
        error
      )
    }
  }

  async function removeBookFromCustomShelf(
    bookKey,
    shelfId
  ) {
    try {
      const {
        error,
      } =
        await supabase
          .from(
            'custom_shelf_books'
          )
          .delete()
          .eq(
            'user_id',
            user.id
          )
          .eq(
            'shelf_id',
            shelfId
          )
          .eq(
            'book_key',
            bookKey
          )

      if (error) {
        throw error
      }

      setCustomShelfBooks(
        (current) =>
          current.filter(
            (item) =>
              !(
                item.shelf_id ===
                  shelfId &&
                item.book_key ===
                  bookKey
              )
          )
      )
    } catch (error) {
      console.error(
        'Could not remove book from custom shelf:',
        error
      )
    }
  }

  function customShelvesForBook(
    bookKey
  ) {
    const shelfIds =
      customShelfBooks
        .filter(
          (item) =>
            item.book_key ===
            bookKey
        )
        .map(
          (item) =>
            item.shelf_id
        )

    return customShelves.filter(
      (shelf) =>
        shelfIds.includes(
          shelf.id
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

        if (
          activeShelf.startsWith(
            'custom:'
          )
        ) {
          const shelfId =
            activeShelf.replace(
              'custom:',
              ''
            )

          return customShelfBooks.some(
            (item) =>
              item.shelf_id ===
                shelfId &&
              item.book_key ===
                book.key
          )
        }

        return (
          book.shelf ===
          activeShelf
        )
      }
    )

  const shelves = [
    'All',
    'Want to Read',
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

      <section className="custom-shelves-card">
        <div className="custom-shelves-heading">
          <div>
            <p className="eyebrow">
              organize your way
            </p>

            <h3>
              Custom Shelves
            </h3>
          </div>

          <span>
            A book can live on
            more than one shelf.
          </span>
        </div>

        <div className="custom-shelf-create">
          <input
            type="text"
            value={
              newShelfName
            }
            placeholder="e.g. Summer Reads"
            maxLength={40}
            onChange={(
              event
            ) => {
              setNewShelfName(
                event.target.value
              )

              setShelfMessage('')
            }}
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                'Enter'
              ) {
                createCustomShelf()
              }
            }}
          />

          <button
            type="button"
            disabled={
              shelfSaving ||
              !newShelfName.trim()
            }
            onClick={
              createCustomShelf
            }
          >
            {shelfSaving
              ? 'Creating...'
              : '+ New Shelf'}
          </button>
        </div>

        {customShelves.length >
        0 ? (
          <div className="custom-shelf-chip-row">
            {customShelves.map(
              (shelf) => (
                <div
                  className={
                    activeShelf ===
                    `custom:${shelf.id}`
                      ? 'custom-shelf-chip active'
                      : 'custom-shelf-chip'
                  }
                  key={
                    shelf.id
                  }
                >
                  <button
                    type="button"
                    className="custom-shelf-chip-name"
                    onClick={() =>
                      setActiveShelf(
                        `custom:${shelf.id}`
                      )
                    }
                  >
                    {shelf.name}

                    <span>
                      {
                        customShelfBooks.filter(
                          (item) =>
                            item.shelf_id ===
                            shelf.id
                        ).length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    className="custom-shelf-chip-edit"
                    title="Rename shelf"
                    onClick={() =>
                      renameCustomShelf(
                        shelf
                      )
                    }
                  >
                    ✎
                  </button>

                  <button
                    type="button"
                    className="custom-shelf-chip-delete"
                    title="Delete shelf"
                    onClick={() =>
                      deleteCustomShelf(
                        shelf
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        ) : (
          <p className="custom-shelves-empty">
            Create shelves for
            moods, genres, book
            clubs, yearly reads,
            or anything else.
          </p>
        )}

        {shelfMessage && (
          <p className="custom-shelf-message">
            {shelfMessage}
          </p>
        )}
      </section>

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

                  {customShelves.length >
                    0 && (
                    <div className="book-custom-shelves">
                      <select
                        className="custom-shelf-select"
                        value=""
                        onChange={(
                          event
                        ) => {
                          const shelfId =
                            event.target
                              .value

                          if (shelfId) {
                            addBookToCustomShelf(
                              book.key,
                              shelfId
                            )
                          }

                          event.target.value =
                            ''
                        }}
                      >
                        <option value="">
                          + Add to custom shelf
                        </option>

                        {customShelves
                          .filter(
                            (shelf) =>
                              !customShelvesForBook(
                                book.key
                              ).some(
                                (
                                  addedShelf
                                ) =>
                                  addedShelf.id ===
                                  shelf.id
                              )
                          )
                          .map(
                            (shelf) => (
                              <option
                                value={
                                  shelf.id
                                }
                                key={
                                  shelf.id
                                }
                              >
                                {
                                  shelf.name
                                }
                              </option>
                            )
                          )}
                      </select>

                      {customShelvesForBook(
                        book.key
                      ).length > 0 && (
                        <div className="book-custom-shelf-tags">
                          {customShelvesForBook(
                            book.key
                          ).map(
                            (
                              shelf
                            ) => (
                              <span
                                key={
                                  shelf.id
                                }
                              >
                                {
                                  shelf.name
                                }

                                <button
                                  type="button"
                                  aria-label={`Remove from ${shelf.name}`}
                                  onClick={() =>
                                    removeBookFromCustomShelf(
                                      book.key,
                                      shelf.id
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
                    event.target.value
                  )
                }
                autoFocus
                autoComplete="off"
              />

              <button
                onClick={() =>
                  searchBooks(
                    query
                  )
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
                    Start typing a
                    title or author
                    to find books.
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
    revealedSpoilers,
    setRevealedSpoilers,
  ] = useState({})

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
              'id, user_id, reviewer_name, rating, review, contains_spoilers, updated_at'
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

        const enrichedReviews =
          await hydrateReviewsWithLikes(
            data || [],
            user?.id
          )

        if (!cancelled) {
          setPublicReviews(
            enrichedReviews
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
  }, [
    decodedKey,
    user?.id,
  ])

  async function toggleDiscoveryReviewLike(
    review
  ) {
    if (!user?.id) {
      return
    }

    const shouldLike =
      !review.is_liked

    setPublicReviews(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            review.id
              ? {
                  ...item,

                  is_liked:
                    shouldLike,

                  like_count:
                    Math.max(
                      0,
                      Number(
                        item.like_count ||
                          0
                      ) +
                        (
                          shouldLike
                            ? 1
                            : -1
                        )
                    ),
                }
              : item
        )
    )

    const success =
      await setReviewLike(
        review.id,
        user.id,
        shouldLike
      )

    if (!success) {
      setPublicReviews(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              review.id
                ? {
                    ...item,

                    is_liked:
                      !shouldLike,

                    like_count:
                      Math.max(
                        0,
                        Number(
                          item.like_count ||
                            0
                        ) +
                          (
                            shouldLike
                              ? -1
                              : 1
                          )
                      ),
                  }
                : item
          )
      )
    }
  }

  function toggleDiscoverySpoiler(
    reviewId
  ) {
    setRevealedSpoilers(
      (current) => ({
        ...current,

        [reviewId]:
          !current[
            reviewId
          ],
      })
    )
  }

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

    const activityType =
      activityTypeForShelf(
        shelf
      )

    if (activityType) {
      createActivity(
        user?.id,
        activityType,
        newBook,
        {
          shelf,
        }
      )
    }

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
                      {review.reviewer_avatar_url ? (
                        <img
                          src={
                            review.reviewer_avatar_url
                          }
                          alt={
                            review.reviewer_name ||
                            'Reader'
                          }
                        />
                      ) : (
                        (review.reviewer_name ||
                          'R')
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>

                    <div className="discovery-review-person">
                      <button
                        type="button"
                        className="reader-profile-link"
                        onClick={() =>
                          navigate(
                            `/profile/${review.user_id}`
                          )
                        }
                      >
                        {review.reviewer_name ||
                          'Reader'}
                      </button>

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
                    review.contains_spoilers &&
                    !revealedSpoilers[
                      review.id
                    ] ? (
                      <div className="review-spoiler-cover">
                        <span>
                          spoiler
                        </span>

                        <p>
                          This review
                          contains
                          spoilers.
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            toggleDiscoverySpoiler(
                              review.id
                            )
                          }
                        >
                          Show review
                        </button>
                      </div>
                    ) : (
                      <>
                        {review.contains_spoilers && (
                          <button
                            type="button"
                            className="hide-spoiler-button"
                            onClick={() =>
                              toggleDiscoverySpoiler(
                                review.id
                              )
                            }
                          >
                            Hide spoiler
                          </button>
                        )}

                        <p className="community-review-body">
                          {
                            review.review
                          }
                        </p>
                      </>
                    )
                  ) : (
                    <p className="discovery-review-empty-text">
                      Rated this book
                      without a
                      written review.
                    </p>
                  )}

                  <div className="community-review-footer">
                    <button
                      type="button"
                      className={
                        review.is_liked
                          ? 'review-like-button liked'
                          : 'review-like-button'
                      }
                      onClick={() =>
                        toggleDiscoveryReviewLike(
                          review
                        )
                      }
                    >
                      <Heart
                        size={15}
                        fill={
                          review.is_liked
                            ? 'currentColor'
                            : 'none'
                        }
                      />

                      <span>
                        {Number(
                          review.like_count ||
                            0
                        )}
                      </span>
                    </button>

                    {review.contains_spoilers && (
                      <span className="spoiler-badge">
                        spoiler
                      </span>
                    )}
                  </div>
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
    reviewContainsSpoilers,
    setReviewContainsSpoilers,
  ] = useState(false)

  const [
    revealedSpoilers,
    setRevealedSpoilers,
  ] = useState({})

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
              'id, user_id, reviewer_name, book_key, book_title, book_author, rating, review, is_public, contains_spoilers, created_at, updated_at'
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

          setReviewContainsSpoilers(
            Boolean(
              ownReview.contains_spoilers
            )
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

        const otherPublicReviews =
          rows.filter(
            (review) =>
              review.user_id !==
                user.id &&
              review.is_public
          )

        const enrichedReviews =
          await hydrateReviewsWithLikes(
            otherPublicReviews,
            user.id
          )

        setPublicReviews(
          enrichedReviews
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

        contains_spoilers:
          reviewContainsSpoilers,

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

      if (
        reviewVisibility ===
        'public'
      ) {
        createActivity(
          user?.id,
          'reviewed',
          {
            ...book,

            rating:
              Number(
                book.rating
              ) || 0,
          },
          {
            rating:
              Number(
                book.rating
              ) || 0,
          }
        )
      }

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

  async function toggleReaderReviewLike(
    review
  ) {
    if (!user?.id) {
      return
    }

    const shouldLike =
      !review.is_liked

    setPublicReviews(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            review.id
              ? {
                  ...item,

                  is_liked:
                    shouldLike,

                  like_count:
                    Math.max(
                      0,
                      Number(
                        item.like_count ||
                          0
                      ) +
                        (
                          shouldLike
                            ? 1
                            : -1
                        )
                    ),
                }
              : item
        )
    )

    const success =
      await setReviewLike(
        review.id,
        user.id,
        shouldLike
      )

    if (!success) {
      setPublicReviews(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              review.id
                ? {
                    ...item,

                    is_liked:
                      !shouldLike,

                    like_count:
                      Math.max(
                        0,
                        Number(
                          item.like_count ||
                            0
                        ) +
                          (
                            shouldLike
                              ? -1
                              : 1
                          )
                      ),
                  }
                : item
          )
      )
    }
  }

  function toggleReaderSpoiler(
    reviewId
  ) {
    setRevealedSpoilers(
      (current) => ({
        ...current,

        [reviewId]:
          !current[
            reviewId
          ],
      })
    )
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
      newShelf !==
      book.shelf
    ) {
      const activityType =
        activityTypeForShelf(
          newShelf
        )

      if (activityType) {
        createActivity(
          user?.id,
          activityType,
          {
            ...book,

            shelf:
              newShelf,
          },
          {
            shelf:
              newShelf,
          }
        )
      }
    }

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

            <button
              type="button"
              className={
                reviewContainsSpoilers
                  ? 'spoiler-toggle active'
                  : 'spoiler-toggle'
              }
              onClick={() => {
                setReviewContainsSpoilers(
                  (
                    current
                  ) =>
                    !current
                )

                setReviewMessage('')
              }}
            >
              <span className="spoiler-toggle-box">
                {reviewContainsSpoilers
                  ? '✓'
                  : ''}
              </span>

              <span>
                <strong>
                  Contains spoilers
                </strong>

                <small>
                  Other readers will
                  have to reveal this
                  review.
                </small>
              </span>
            </button>

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
                          {review.reviewer_avatar_url ? (
                            <img
                              src={
                                review.reviewer_avatar_url
                              }
                              alt={
                                review.reviewer_name ||
                                'Reader'
                              }
                            />
                          ) : (
                            (review.reviewer_name ||
                              'R')
                              .charAt(0)
                              .toUpperCase()
                          )}
                        </div>

                        <div className="reader-review-user">
                          <button
                            type="button"
                            className="reader-profile-link"
                            onClick={() =>
                              navigate(
                                `/profile/${review.user_id}`
                              )
                            }
                          >
                            {review.reviewer_name ||
                              'Reader'}
                          </button>

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
                        review.contains_spoilers &&
                        !revealedSpoilers[
                          review.id
                        ] ? (
                          <div className="review-spoiler-cover">
                            <span>
                              spoiler
                            </span>

                            <p>
                              This review
                              contains
                              spoilers.
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                toggleReaderSpoiler(
                                  review.id
                                )
                              }
                            >
                              Show review
                            </button>
                          </div>
                        ) : (
                          <>
                            {review.contains_spoilers && (
                              <button
                                type="button"
                                className="hide-spoiler-button"
                                onClick={() =>
                                  toggleReaderSpoiler(
                                    review.id
                                  )
                                }
                              >
                                Hide spoiler
                              </button>
                            )}

                            <p className="reader-review-text">
                              {
                                review.review
                              }
                            </p>
                          </>
                        )
                      ) : (
                        <p className="reader-review-text reader-review-no-text">
                          Rated this book
                          without a
                          written review.
                        </p>
                      )}

                      <div className="community-review-footer">
                        <button
                          type="button"
                          className={
                            review.is_liked
                              ? 'review-like-button liked'
                              : 'review-like-button'
                          }
                          onClick={() =>
                            toggleReaderReviewLike(
                              review
                            )
                          }
                        >
                          <Heart
                            size={15}
                            fill={
                              review.is_liked
                                ? 'currentColor'
                                : 'none'
                            }
                          />

                          <span>
                            {Number(
                              review.like_count ||
                                0
                            )}
                          </span>
                        </button>

                        {review.contains_spoilers && (
                          <span className="spoiler-badge">
                            spoiler
                          </span>
                        )}
                      </div>
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
   PROFILE
===================================================== */

function ProfilePage({
  user,
}) {
  const [
    profile,
    setProfile,
  ] = useState({
    username: '',
    display_name:
      user?.name || '',
    bio: '',
    avatar_url: '',
    favorite_genres: [],
  })

  const [
    draft,
    setDraft,
  ] = useState({
    username: '',
    display_name:
      user?.name || '',
    bio: '',
    favorite_genres:
      '',
  })

  const [
    editing,
    setEditing,
  ] = useState(false)

  const [
    profileLoading,
    setProfileLoading,
  ] = useState(true)

  const [
    profileSaving,
    setProfileSaving,
  ] = useState(false)

  const [
    profileMessage,
    setProfileMessage,
  ] = useState('')

  const [
    avatarUploading,
    setAvatarUploading,
  ] = useState(false)

  const avatarInputRef =
    useRef(null)

  const [
    publicReviews,
    setPublicReviews,
  ] = useState([])

  const [
    followerCount,
    setFollowerCount,
  ] = useState(0)

  const [
    followingCount,
    setFollowingCount,
  ] = useState(0)

  const [books, setBooks] =
    useState(loadBooks)

  useEffect(() => {
    function refreshBooks() {
      setBooks(
        loadBooks()
      )
    }

    window.addEventListener(
      'booksUpdated',
      refreshBooks
    )

    window.addEventListener(
      'storage',
      refreshBooks
    )

    return () => {
      window.removeEventListener(
        'booksUpdated',
        refreshBooks
      )

      window.removeEventListener(
        'storage',
        refreshBooks
      )
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!user?.id) {
        return
      }

      setProfileLoading(true)

      try {
        const [
          profileResult,
          reviewsResult,
          followersResult,
          followingResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'profiles'
              )
              .select(
                'id, username, display_name, bio, avatar_url, favorite_genres, created_at, updated_at'
              )
              .eq(
                'id',
                user.id
              )
              .maybeSingle(),

            supabase
              .from(
                'reviews'
              )
              .select(
                'id, book_key, book_title, book_author, rating, review, updated_at'
              )
              .eq(
                'user_id',
                user.id
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
              .limit(4),

            supabase
              .from(
                'follows'
              )
              .select(
                'id',
                {
                  count:
                    'exact',
                  head:
                    true,
                }
              )
              .eq(
                'following_id',
                user.id
              ),

            supabase
              .from(
                'follows'
              )
              .select(
                'id',
                {
                  count:
                    'exact',
                  head:
                    true,
                }
              )
              .eq(
                'follower_id',
                user.id
              ),
          ])

        if (
          profileResult.error
        ) {
          throw (
            profileResult.error
          )
        }

        if (
          reviewsResult.error
        ) {
          throw (
            reviewsResult.error
          )
        }

        if (
          followersResult.error
        ) {
          throw (
            followersResult.error
          )
        }

        if (
          followingResult.error
        ) {
          throw (
            followingResult.error
          )
        }

        let nextProfile =
          profileResult.data

        if (!nextProfile) {
          const defaultUsername =
            (user.email
              ?.split('@')[0] ||
              user.name ||
              'reader')
              .toLowerCase()
              .replace(
                /[^a-z0-9_]/g,
                ''
              )
              .slice(
                0,
                24
              )

          const {
            data,
            error,
          } =
            await supabase
              .from(
                'profiles'
              )
              .upsert(
                {
                  id:
                    user.id,

                  username:
                    defaultUsername ||
                    `reader_${user.id.slice(
                      0,
                      6
                    )}`,

                  display_name:
                    user.name ||
                    'Reader',

                  bio:
                    '',

                  favorite_genres:
                    [],

                  updated_at:
                    new Date()
                      .toISOString(),
                },
                {
                  onConflict:
                    'id',
                }
              )
              .select(
                'id, username, display_name, bio, avatar_url, favorite_genres, created_at, updated_at'
              )
              .single()

          if (error) {
            throw error
          }

          nextProfile =
            data
        }

        if (cancelled) {
          return
        }

        const cleanProfile = {
          username:
            nextProfile
              ?.username ||
            '',

          display_name:
            nextProfile
              ?.display_name ||
            user.name ||
            'Reader',

          bio:
            nextProfile
              ?.bio ||
            '',

          avatar_url:
            nextProfile
              ?.avatar_url ||
            '',

          favorite_genres:
            Array.isArray(
              nextProfile
                ?.favorite_genres
            )
              ? nextProfile
                  .favorite_genres
              : [],
        }

        setProfile(
          cleanProfile
        )

        setDraft({
          username:
            cleanProfile
              .username,

          display_name:
            cleanProfile
              .display_name,

          bio:
            cleanProfile.bio,

          favorite_genres:
            cleanProfile
              .favorite_genres
              .join(', '),
        })

        setPublicReviews(
          reviewsResult.data ||
          []
        )

        setFollowerCount(
          followersResult.count ||
          0
        )

        setFollowingCount(
          followingResult.count ||
          0
        )
      } catch (error) {
        console.error(
          'Error loading profile:',
          error
        )

        if (!cancelled) {
          setProfileMessage(
            'Could not load your profile.'
          )
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(
            false
          )
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [
    user?.id,
    user?.email,
    user?.name,
  ])

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

  const favoriteBooks =
    books
      .filter(
        (book) =>
          book.favorite
      )
      .slice(0, 4)

  async function uploadAvatar(
    event
  ) {
    const file =
      event.target.files?.[0]

    event.target.value =
      ''

    if (!file) {
      return
    }

    if (
      !file.type.startsWith(
        'image/'
      )
    ) {
      setProfileMessage(
        'Please choose an image file.'
      )

      return
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setProfileMessage(
        'Profile pictures must be 5 MB or smaller.'
      )

      return
    }

    if (!user?.id) {
      return
    }

    setAvatarUploading(
      true
    )

    setProfileMessage('')

    const avatarPath =
      `${user.id}/avatar`

    try {
      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from('avatars')
          .upload(
            avatarPath,
            file,
            {
              cacheControl:
                '3600',

              upsert: true,

              contentType:
                file.type,
            }
          )

      if (uploadError) {
        throw uploadError
      }

      const {
        data:
          publicUrlData,
      } =
        supabase.storage
          .from('avatars')
          .getPublicUrl(
            avatarPath
          )

      const baseUrl =
        publicUrlData
          ?.publicUrl

      if (!baseUrl) {
        throw new Error(
          'Could not create avatar URL.'
        )
      }

      const avatarUrl =
        `${baseUrl}?v=${Date.now()}`

      const {
        error:
          profileError,
      } =
        await supabase
          .from('profiles')
          .upsert(
            {
              id:
                user.id,

              avatar_url:
                avatarUrl,

              display_name:
                profile.display_name ||
                user.name ||
                'Reader',

              username:
                profile.username ||
                (
                  user.email
                    ?.split('@')[0] ||
                  `reader_${user.id.slice(
                    0,
                    6
                  )}`
                )
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9_]/g,
                    ''
                  ),

              bio:
                profile.bio ||
                '',

              favorite_genres:
                profile.favorite_genres ||
                [],

              updated_at:
                new Date()
                  .toISOString(),
            },
            {
              onConflict:
                'id',
            }
          )

      if (profileError) {
        throw profileError
      }

      setProfile(
        (current) => ({
          ...current,

          avatar_url:
            avatarUrl,
        })
      )

      window.dispatchEvent(
        new CustomEvent(
          'profileUpdated',
          {
            detail: {
              userId:
                user.id,

              avatarUrl,
            },
          }
        )
      )

      setProfileMessage(
        'Profile picture updated.'
      )
    } catch (error) {
      console.error(
        'Could not upload avatar:',
        error
      )

      setProfileMessage(
        'Could not upload your profile picture. Make sure the avatars bucket and Storage policies are set up.'
      )
    } finally {
      setAvatarUploading(
        false
      )
    }
  }

  async function removeAvatar() {
    if (
      !user?.id ||
      !profile.avatar_url
    ) {
      return
    }

    setAvatarUploading(
      true
    )

    setProfileMessage('')

    const avatarPath =
      `${user.id}/avatar`

    try {
      const {
        error:
          storageError,
      } =
        await supabase.storage
          .from('avatars')
          .remove([
            avatarPath,
          ])

      if (
        storageError
      ) {
        console.error(
          'Could not remove avatar file:',
          storageError
        )
      }

      const {
        error:
          profileError,
      } =
        await supabase
          .from('profiles')
          .update({
            avatar_url:
              null,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            user.id
          )

      if (profileError) {
        throw profileError
      }

      setProfile(
        (current) => ({
          ...current,

          avatar_url: '',
        })
      )

      window.dispatchEvent(
        new CustomEvent(
          'profileUpdated',
          {
            detail: {
              userId:
                user.id,

              avatarUrl:
                '',
            },
          }
        )
      )

      setProfileMessage(
        'Profile picture removed.'
      )
    } catch (error) {
      console.error(
        'Could not remove avatar:',
        error
      )

      setProfileMessage(
        'Could not remove your profile picture.'
      )
    } finally {
      setAvatarUploading(
        false
      )
    }
  }

  async function saveProfile() {
    if (!user?.id) {
      return
    }

    const username =
      draft.username
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          '_'
        )
        .replace(
          /[^a-z0-9_]/g,
          ''
        )

    const displayName =
      draft.display_name
        .trim()

    if (
      username.length < 3
    ) {
      setProfileMessage(
        'Username must be at least 3 characters.'
      )

      return
    }

    if (!displayName) {
      setProfileMessage(
        'Please add a display name.'
      )

      return
    }

    const genres =
      draft.favorite_genres
        .split(',')
        .map(
          (genre) =>
            genre.trim()
        )
        .filter(Boolean)
        .slice(0, 8)

    setProfileSaving(true)
    setProfileMessage('')

    try {
      const now =
        new Date()
          .toISOString()

      const {
        data,
        error,
      } =
        await supabase
          .from(
            'profiles'
          )
          .upsert(
            {
              id:
                user.id,

              username,

              display_name:
                displayName,

              bio:
                draft.bio
                  .trim(),

              favorite_genres:
                genres,

              updated_at:
                now,
            },
            {
              onConflict:
                'id',
            }
          )
          .select(
            'username, display_name, bio, avatar_url, favorite_genres'
          )
          .single()

      if (error) {
        throw error
      }

      const {
        error:
          authError,
      } =
        await supabase.auth
          .updateUser({
            data: {
              name:
                displayName,
            },
          })

      if (authError) {
        console.error(
          'Could not update auth display name:',
          authError
        )
      }

      const cleanProfile = {
        username:
          data.username ||
          '',

        display_name:
          data.display_name ||
          displayName,

        bio:
          data.bio ||
          '',

        avatar_url:
          data.avatar_url ||
          '',

        favorite_genres:
          Array.isArray(
            data.favorite_genres
          )
            ? data.favorite_genres
            : [],
      }

      setProfile(
        cleanProfile
      )

      setDraft({
        username:
          cleanProfile
            .username,

        display_name:
          cleanProfile
            .display_name,

        bio:
          cleanProfile.bio,

        favorite_genres:
          cleanProfile
            .favorite_genres
            .join(', '),
      })

      setEditing(false)

      setProfileMessage(
        'Profile saved.'
      )
    } catch (error) {
      console.error(
        'Error saving profile:',
        error
      )

      if (
        error?.code ===
        '23505'
      ) {
        setProfileMessage(
          'That username is already taken.'
        )
      } else {
        setProfileMessage(
          'Could not save your profile. Please try again.'
        )
      }
    } finally {
      setProfileSaving(false)
    }
  }

  if (profileLoading) {
    return (
      <div className="profile-page-loading">
        <UserRound
          size={28}
        />

        <p>
          Loading your profile...
        </p>
      </div>
    )
  }

  const displayName =
    profile.display_name ||
    user?.name ||
    'Reader'

  const profileInitial =
    displayName
      .charAt(0)
      .toUpperCase()

  return (
    <div className="page profile-page">
      <section className="profile-hero-card">
        <div className="profile-avatar-area">
          <div className="profile-avatar-large">
            {profile.avatar_url ? (
              <img
                src={
                  profile.avatar_url
                }
                alt={
                  displayName
                }
              />
            ) : (
              <span>
                {
                  profileInitial
                }
              </span>
            )}
          </div>

          <input
            ref={
              avatarInputRef
            }
            className="avatar-file-input"
            type="file"
            accept="image/*"
            onChange={
              uploadAvatar
            }
          />

          <div className="profile-avatar-actions">
            <button
              type="button"
              disabled={
                avatarUploading
              }
              onClick={() =>
                avatarInputRef
                  .current
                  ?.click()
              }
            >
              {avatarUploading
                ? 'Uploading...'
                : profile.avatar_url
                  ? 'Change photo'
                  : 'Add photo'}
            </button>

            {profile.avatar_url && (
              <button
                type="button"
                className="profile-remove-photo"
                disabled={
                  avatarUploading
                }
                onClick={
                  removeAvatar
                }
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="profile-identity">
          <p className="eyebrow">
            your reading profile
          </p>

          <h1>
            {displayName}
          </h1>

          <p className="profile-username">
            @
            {profile.username ||
              'reader'}
          </p>

          {profile.bio ? (
            <p className="profile-bio">
              {profile.bio}
            </p>
          ) : (
            <p className="profile-bio profile-bio-empty">
              Add a little note
              about your reading
              life.
            </p>
          )}

          {profile.favorite_genres
            .length > 0 && (
            <div className="profile-genre-row">
              {profile.favorite_genres.map(
                (genre) => (
                  <span
                    key={
                      genre
                    }
                  >
                    {genre}
                  </span>
                )
              )}
            </div>
          )}
        </div>

        <div className="profile-hero-actions">
          <button
            className="profile-edit-button"
            onClick={() => {
              setEditing(
                !editing
              )

              setProfileMessage(
                ''
              )
            }}
          >
            {editing
              ? 'Cancel'
              : 'Edit profile'}
          </button>
        </div>
      </section>

      <section className="profile-stat-row">
        <div>
          <strong>
            {
              finishedBooks.length
            }
          </strong>

          <span>
            books read
          </span>
        </div>

        <div>
          <strong>
            {
              publicReviews.length
            }
          </strong>

          <span>
            public reviews
          </span>
        </div>

        <div>
          <strong>
            {
              followerCount
            }
          </strong>

          <span>
            followers
          </span>
        </div>

        <div>
          <strong>
            {
              followingCount
            }
          </strong>

          <span>
            following
          </span>
        </div>
      </section>

      {editing && (
        <section className="profile-edit-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                make it yours
              </p>

              <h2>
                Edit Profile
              </h2>
            </div>
          </div>

          <div className="profile-form-grid">
            <label>
              Display name

              <input
                type="text"
                value={
                  draft.display_name
                }
                maxLength={50}
                onChange={(
                  event
                ) =>
                  setDraft(
                    (
                      current
                    ) => ({
                      ...current,

                      display_name:
                        event
                          .target
                          .value,
                    })
                  )
                }
              />
            </label>

            <label>
              Username

              <div className="profile-username-input">
                <span>
                  @
                </span>

                <input
                  type="text"
                  value={
                    draft.username
                  }
                  maxLength={24}
                  onChange={(
                    event
                  ) =>
                    setDraft(
                      (
                        current
                      ) => ({
                        ...current,

                        username:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                />
              </div>
            </label>

            <label className="profile-form-wide">
              Bio

              <textarea
                value={
                  draft.bio
                }
                maxLength={180}
                placeholder="Tell other readers a little about you..."
                onChange={(
                  event
                ) =>
                  setDraft(
                    (
                      current
                    ) => ({
                      ...current,

                      bio:
                        event
                          .target
                          .value,
                    })
                  )
                }
              />
            </label>

            <label className="profile-form-wide">
              Favorite genres

              <input
                type="text"
                value={
                  draft.favorite_genres
                }
                placeholder="Mystery, fantasy, romance"
                onChange={(
                  event
                ) =>
                  setDraft(
                    (
                      current
                    ) => ({
                      ...current,

                      favorite_genres:
                        event
                          .target
                          .value,
                    })
                  )
                }
              />

              <small>
                Separate genres
                with commas.
              </small>
            </label>
          </div>

          <div className="profile-save-row">
            <p>
              {profileMessage}
            </p>

            <button
              disabled={
                profileSaving
              }
              onClick={
                saveProfile
              }
            >
              {profileSaving
                ? 'Saving...'
                : 'Save profile'}
            </button>
          </div>
        </section>
      )}

      {!editing &&
        profileMessage && (
          <p className="profile-page-message">
            {profileMessage}
          </p>
        )}

      <div className="profile-content-grid">
        <section className="profile-section-card profile-current-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                on your nightstand
              </p>

              <h2>
                Currently Reading
              </h2>
            </div>
          </div>

          {currentlyReading.length >
          0 ? (
            <div className="profile-book-strip">
              {currentlyReading
                .slice(0, 4)
                .map(
                  (book) => (
                    <a
                      href={`/books/${encodeURIComponent(
                        book.key
                      )}`}
                      className="profile-mini-book"
                      key={
                        book.key
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
                        <div className="profile-mini-cover-empty">
                          <BookOpen
                            size={24}
                          />
                        </div>
                      )}

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
                    </a>
                  )
                )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <BookOpen
                size={25}
              />

              <p>
                Nothing in progress
                right now.
              </p>
            </div>
          )}
        </section>

        <section className="profile-section-card profile-favorites-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                your top shelf
              </p>

              <h2>
                Favorite Books
              </h2>
            </div>
          </div>

          {favoriteBooks.length >
          0 ? (
            <div className="profile-favorite-grid">
              {favoriteBooks.map(
                (book) => (
                  <a
                    href={`/books/${encodeURIComponent(
                      book.key
                    )}`}
                    className="profile-favorite-book"
                    key={
                      book.key
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
                      <div className="profile-favorite-cover-empty">
                        <BookOpen
                          size={24}
                        />
                      </div>
                    )}
                  </a>
                )
              )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <Heart
                size={24}
              />

              <p>
                Heart a book to
                feature it here.
              </p>
            </div>
          )}
        </section>

        <section className="profile-section-card profile-reviews-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                shared thoughts
              </p>

              <h2>
                Recent Reviews
              </h2>
            </div>
          </div>

          {publicReviews.length >
          0 ? (
            <div className="profile-review-list">
              {publicReviews.map(
                (review) => (
                  <article
                    key={
                      review.id
                    }
                    className="profile-review-item"
                  >
                    <div className="profile-review-item-top">
                      <div>
                        <strong>
                          {
                            review.book_title
                          }
                        </strong>

                        <span>
                          {
                            review.book_author
                          }
                        </span>
                      </div>

                      <div className="profile-review-stars">
                        {[1, 2, 3, 4, 5].map(
                          (
                            star
                          ) => (
                            <Star
                              key={
                                star
                              }
                              size={14}
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

                    {review.review && (
                      <p>
                        {
                          review.review
                        }
                      </p>
                    )}
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <PenLine
                size={24}
              />

              <p>
                Your public reviews
                will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}


/* =====================================================
   PUBLIC PROFILE
===================================================== */

function PublicProfilePage({
  user,
}) {
  const navigate =
    useNavigate()

  const { userId } =
    useParams()

  const [
    profile,
    setProfile,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    followLoading,
    setFollowLoading,
  ] = useState(false)

  const [
    isFollowing,
    setIsFollowing,
  ] = useState(false)

  const [
    followerCount,
    setFollowerCount,
  ] = useState(0)

  const [
    followingCount,
    setFollowingCount,
  ] = useState(0)

  const [
    publicReviews,
    setPublicReviews,
  ] = useState([])

  const [
    publicBooks,
    setPublicBooks,
  ] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadPublicProfile() {
      if (!userId) {
        return
      }

      setLoading(true)

      try {
        const [
          profileResult,
          reviewsResult,
          followersResult,
          followingResult,
          followStateResult,
          booksResult,
        ] =
          await Promise.all([
            supabase
              .from('profiles')
              .select(
                'id, username, display_name, bio, avatar_url, favorite_genres, created_at'
              )
              .eq(
                'id',
                userId
              )
              .maybeSingle(),

            supabase
              .from('reviews')
              .select(
                'id, book_key, book_title, book_author, rating, review, updated_at'
              )
              .eq(
                'user_id',
                userId
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
              .limit(6),

            supabase
              .from('follows')
              .select(
                'id',
                {
                  count:
                    'exact',
                  head:
                    true,
                }
              )
              .eq(
                'following_id',
                userId
              ),

            supabase
              .from('follows')
              .select(
                'id',
                {
                  count:
                    'exact',
                  head:
                    true,
                }
              )
              .eq(
                'follower_id',
                userId
              ),

            user?.id &&
            user.id !== userId
              ? supabase
                  .from('follows')
                  .select('id')
                  .eq(
                    'follower_id',
                    user.id
                  )
                  .eq(
                    'following_id',
                    userId
                  )
                  .maybeSingle()
              : Promise.resolve({
                  data: null,
                  error: null,
                }),

            supabase
              .from('user_books')
              .select(
                'book_key, title, author, cover, shelf, favorite, rating'
              )
              .eq(
                'user_id',
                userId
              )
              .in(
                'shelf',
                [
                  'Currently Reading',
                  'Finished',
                ]
              )
              .order(
                'updated_at',
                {
                  ascending:
                    false,
                }
              )
              .limit(20),
          ])

        const errors = [
          profileResult.error,
          reviewsResult.error,
          followersResult.error,
          followingResult.error,
          followStateResult.error,
          booksResult.error,
        ].filter(Boolean)

        if (errors.length) {
          throw errors[0]
        }

        if (cancelled) {
          return
        }

        setProfile(
          profileResult.data
        )

        setPublicReviews(
          reviewsResult.data ||
          []
        )

        setFollowerCount(
          followersResult.count ||
          0
        )

        setFollowingCount(
          followingResult.count ||
          0
        )

        setIsFollowing(
          Boolean(
            followStateResult.data
          )
        )

        setPublicBooks(
          booksResult.data ||
          []
        )
      } catch (error) {
        console.error(
          'Error loading public profile:',
          error
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPublicProfile()

    return () => {
      cancelled = true
    }
  }, [
    userId,
    user?.id,
  ])

  async function toggleFollow() {
    if (
      !user?.id ||
      !userId ||
      user.id === userId
    ) {
      return
    }

    setFollowLoading(true)

    try {
      if (isFollowing) {
        const {
          error,
        } =
          await supabase
            .from('follows')
            .delete()
            .eq(
              'follower_id',
              user.id
            )
            .eq(
              'following_id',
              userId
            )

        if (error) {
          throw error
        }

        setIsFollowing(false)

        setFollowerCount(
          (count) =>
            Math.max(
              0,
              count - 1
            )
        )
      } else {
        const {
          error,
        } =
          await supabase
            .from('follows')
            .insert({
              follower_id:
                user.id,

              following_id:
                userId,
            })

        if (error) {
          throw error
        }

        setIsFollowing(true)

        setFollowerCount(
          (count) =>
            count + 1
        )
      }
    } catch (error) {
      console.error(
        'Error updating follow:',
        error
      )
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="profile-page-loading">
        <UserRound
          size={28}
        />

        <p>
          Loading reader...
        </p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="empty-page-card">
        <UserRound
          size={34}
        />

        <h3>
          Reader not found
        </h3>

        <p>
          This Pagelette profile
          is unavailable.
        </p>
      </div>
    )
  }

  const displayName =
    profile.display_name ||
    profile.username ||
    'Reader'

  const initial =
    displayName
      .charAt(0)
      .toUpperCase()

  const currentlyReading =
    publicBooks.filter(
      (book) =>
        book.shelf ===
        'Currently Reading'
    )

  const favoriteBooks =
    publicBooks
      .filter(
        (book) =>
          book.favorite
      )
      .slice(0, 4)

  return (
    <div className="page public-profile-page">
      <button
        className="detail-back-button"
        onClick={() =>
          navigate(-1)
        }
      >
        <ArrowLeft
          size={17}
        />

        Back
      </button>

      <section className="profile-hero-card">
        <div className="profile-avatar-large">
          {profile.avatar_url ? (
            <img
              src={
                profile.avatar_url
              }
              alt={
                displayName
              }
            />
          ) : (
            <span>
              {initial}
            </span>
          )}
        </div>

        <div className="profile-identity">
          <p className="eyebrow">
            Pagelette reader
          </p>

          <h1>
            {displayName}
          </h1>

          <p className="profile-username">
            @
            {profile.username ||
              'reader'}
          </p>

          {profile.bio && (
            <p className="profile-bio">
              {profile.bio}
            </p>
          )}

          {Array.isArray(
            profile.favorite_genres
          ) &&
            profile.favorite_genres
              .length > 0 && (
              <div className="profile-genre-row">
                {profile.favorite_genres.map(
                  (genre) => (
                    <span
                      key={
                        genre
                      }
                    >
                      {genre}
                    </span>
                  )
                )}
              </div>
            )}
        </div>

        <div className="profile-hero-actions">
          {user?.id ===
          userId ? (
            <button
              className="profile-edit-button"
              onClick={() =>
                navigate(
                  '/profile'
                )
              }
            >
              View your profile
            </button>
          ) : (
            <button
              className={
                isFollowing
                  ? 'profile-follow-button following'
                  : 'profile-follow-button'
              }
              disabled={
                followLoading
              }
              onClick={
                toggleFollow
              }
            >
              {followLoading
                ? 'Saving...'
                : isFollowing
                  ? 'Following'
                  : 'Follow'}
            </button>
          )}
        </div>
      </section>

      <section className="profile-stat-row">
        <div>
          <strong>
            {
              publicBooks.filter(
                (book) =>
                  book.shelf ===
                  'Finished'
              ).length
            }
          </strong>

          <span>
            books read
          </span>
        </div>

        <div>
          <strong>
            {
              publicReviews.length
            }
          </strong>

          <span>
            public reviews
          </span>
        </div>

        <div>
          <strong>
            {
              followerCount
            }
          </strong>

          <span>
            followers
          </span>
        </div>

        <div>
          <strong>
            {
              followingCount
            }
          </strong>

          <span>
            following
          </span>
        </div>
      </section>

      <div className="profile-content-grid">
        <section className="profile-section-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                currently
              </p>

              <h2>
                Currently Reading
              </h2>
            </div>
          </div>

          {currentlyReading.length >
          0 ? (
            <div className="profile-book-strip">
              {currentlyReading
                .slice(0, 4)
                .map(
                  (book) => (
                    <div
                      className="profile-mini-book"
                      key={
                        book.book_key
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
                        <div className="profile-mini-cover-empty">
                          <BookOpen
                            size={24}
                          />
                        </div>
                      )}

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
                  )
                )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <BookOpen
                size={24}
              />

              <p>
                Nothing in progress
                right now.
              </p>
            </div>
          )}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                favorites
              </p>

              <h2>
                Favorite Books
              </h2>
            </div>
          </div>

          {favoriteBooks.length >
          0 ? (
            <div className="profile-favorite-grid">
              {favoriteBooks.map(
                (book) => (
                  <div
                    className="profile-favorite-book"
                    key={
                      book.book_key
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
                      <div className="profile-favorite-cover-empty">
                        <BookOpen
                          size={24}
                        />
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <Heart
                size={24}
              />

              <p>
                No favorite books
                yet.
              </p>
            </div>
          )}
        </section>

        <section className="profile-section-card profile-reviews-card">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">
                recent thoughts
              </p>

              <h2>
                Public Reviews
              </h2>
            </div>
          </div>

          {publicReviews.length >
          0 ? (
            <div className="profile-review-list">
              {publicReviews.map(
                (review) => (
                  <article
                    key={
                      review.id
                    }
                    className="profile-review-item"
                  >
                    <div className="profile-review-item-top">
                      <div>
                        <strong>
                          {
                            review.book_title
                          }
                        </strong>

                        <span>
                          {
                            review.book_author
                          }
                        </span>
                      </div>

                      <div className="profile-review-stars">
                        {[1, 2, 3, 4, 5].map(
                          (
                            star
                          ) => (
                            <Star
                              key={
                                star
                              }
                              size={14}
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

                    {review.review && (
                      <p>
                        {
                          review.review
                        }
                      </p>
                    )}
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="profile-empty-state">
              <PenLine
                size={24}
              />

              <p>
                No public reviews
                yet.
              </p>
            </div>
          )}
        </section>
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

function StatsPage({
  user,
}) {
  const [books] =
    useState(loadBooks)

  const currentYear =
    new Date()
      .getFullYear()

  const availableYears =
    Array.from(
      new Set(
        [
          currentYear,
          ...books
            .map(
              (book) =>
                book.finishedDate
                  ? new Date(
                      `${book.finishedDate}T00:00:00`
                    )
                      .getFullYear()
                  : null
            )
            .filter(Boolean),
        ]
      )
    ).sort(
      (a, b) =>
        b - a
    )

  const [
    recapYear,
    setRecapYear,
  ] = useState(
    availableYears[0] ||
    currentYear
  )

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
                  recapYear &&
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

  const recapBooks =
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
          recapYear
        )
      }
    )

  const recapPages =
    recapBooks.reduce(
      (total, book) =>
        total +
        (
          Number(
            book.totalPages
          ) ||
          Number(
            book.pagesRead
          ) ||
          0
        ),
      0
    )

  const recapRatedBooks =
    recapBooks.filter(
      (book) =>
        Number(
          book.rating
        ) > 0
    )

  const recapAverageRating =
    recapRatedBooks.length > 0
      ? (
          recapRatedBooks.reduce(
            (
              total,
              book
            ) =>
              total +
              Number(
                book.rating
              ),
            0
          ) /
          recapRatedBooks.length
        ).toFixed(1)
      : '0.0'

  const booksWithDuration =
    recapBooks
      .map(
        (book) => {
          if (
            !book.startedDate ||
            !book.finishedDate
          ) {
            return null
          }

          const startDate =
            new Date(
              `${book.startedDate}T00:00:00`
            )

          const finishDate =
            new Date(
              `${book.finishedDate}T00:00:00`
            )

          const days =
            Math.max(
              1,
              Math.round(
                (
                  finishDate -
                  startDate
                ) /
                  (
                    1000 *
                    60 *
                    60 *
                    24
                  )
              ) + 1
            )

          return {
            book,
            days,
          }
        }
      )
      .filter(Boolean)

  const recapAverageDays =
    booksWithDuration.length >
    0
      ? Math.round(
          booksWithDuration.reduce(
            (
              total,
              item
            ) =>
              total +
              item.days,
            0
          ) /
            booksWithDuration.length
        )
      : 0

  const fastestRead =
    booksWithDuration.length >
    0
      ? [...booksWithDuration]
          .sort(
            (a, b) =>
              a.days -
              b.days
          )[0]
      : null

  const longestRead =
    booksWithDuration.length >
    0
      ? [...booksWithDuration]
          .sort(
            (a, b) =>
              b.days -
              a.days
          )[0]
      : null

  const highestRatedBook =
    recapRatedBooks.length >
    0
      ? [...recapRatedBooks]
          .sort(
            (a, b) => {
              const ratingDifference =
                Number(
                  b.rating
                ) -
                Number(
                  a.rating
                )

              if (
                ratingDifference !==
                0
              ) {
                return (
                  ratingDifference
                )
              }

              return (
                Number(
                  b.totalPages ||
                    b.pagesRead ||
                    0
                ) -
                Number(
                  a.totalPages ||
                    a.pagesRead ||
                    0
                )
              )
            }
          )[0]
      : null

  const longestBook =
    recapBooks.length >
    0
      ? [...recapBooks]
          .sort(
            (a, b) =>
              Number(
                b.totalPages ||
                  b.pagesRead ||
                  0
              ) -
              Number(
                a.totalPages ||
                  a.pagesRead ||
                  0
              )
          )[0]
      : null

  const recapFavorites =
    recapBooks
      .filter(
        (book) =>
          book.favorite
      )
      .slice(0, 4)

  const bestMonth =
    [...finishedByMonth]
      .sort(
        (a, b) =>
          b.count -
          a.count
      )[0]

  const displayName =
    user?.name ||
    'Reader'

  function recapText() {
    const favoriteLine =
      highestRatedBook
        ? `Top read: ${highestRatedBook.title} (${Number(
            highestRatedBook.rating
          ).toFixed(
            Number(
              highestRatedBook.rating
            ) % 1 ===
              0
              ? 0
              : 1
          )}★)`
        : 'Top read: still waiting for a favorite'

    return [
      `${displayName}'s ${recapYear} Pagelette Reading Recap`,
      `${recapBooks.length} books finished`,
      `${recapPages.toLocaleString()} pages`,
      `${recapAverageRating} average rating`,
      favoriteLine,
      'pagelette.vercel.app',
    ].join('\n')
  }

  async function shareRecap() {
    const text =
      recapText()

    if (
      navigator.share
    ) {
      try {
        await navigator.share({
          title:
            `${recapYear} Pagelette Reading Recap`,

          text,
        })

        return
      } catch (error) {
        if (
          error?.name ===
          'AbortError'
        ) {
          return
        }
      }
    }

    try {
      await navigator.clipboard
        .writeText(
          text
        )

      window.alert(
        'Your recap was copied to your clipboard.'
      )
    } catch {
      window.alert(
        text
      )
    }
  }

  function escapeXml(
    value
  ) {
    return String(
      value ?? ''
    )
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&apos;'
      )
  }

  function downloadRecap() {
    const width =
      1080

    const height =
      1350

    const topBook =
      highestRatedBook
        ?.title ||
      'Your next favorite is waiting'

    const safeName =
      escapeXml(
        displayName
      )

    const safeBook =
      escapeXml(
        topBook.length > 40
          ? `${topBook.slice(
              0,
              37
            )}...`
          : topBook
      )

    const svg = `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="${width}"
        height="${height}"
        viewBox="0 0 ${width} ${height}"
      >
        <rect
          width="1080"
          height="1350"
          rx="0"
          fill="#f7f4f5"
        />

        <circle
          cx="930"
          cy="120"
          r="210"
          fill="#f3d6dc"
          opacity="0.72"
        />

        <circle
          cx="120"
          cy="1190"
          r="260"
          fill="#f8e8ec"
          opacity="0.9"
        />

        <text
          x="90"
          y="115"
          font-family="Georgia, serif"
          font-size="46"
          fill="#514a4e"
        >
          Pagelette
        </text>

        <text
          x="90"
          y="215"
          font-family="Arial, sans-serif"
          font-size="26"
          fill="#d47c8c"
          letter-spacing="4"
        >
          ${recapYear} READING RECAP
        </text>

        <text
          x="90"
          y="310"
          font-family="Georgia, serif"
          font-size="64"
          fill="#3f393d"
        >
          ${safeName}
        </text>

        <text
          x="90"
          y="375"
          font-family="Georgia, serif"
          font-size="44"
          fill="#625b60"
        >
          your year in books
        </text>

        <rect
          x="90"
          y="455"
          width="900"
          height="250"
          rx="36"
          fill="#ffffff"
        />

        <text
          x="155"
          y="555"
          font-family="Georgia, serif"
          font-size="70"
          fill="#d67f8f"
        >
          ${recapBooks.length}
        </text>

        <text
          x="155"
          y="605"
          font-family="Arial, sans-serif"
          font-size="25"
          fill="#777075"
        >
          books finished
        </text>

        <text
          x="440"
          y="555"
          font-family="Georgia, serif"
          font-size="70"
          fill="#d67f8f"
        >
          ${recapPages.toLocaleString()}
        </text>

        <text
          x="440"
          y="605"
          font-family="Arial, sans-serif"
          font-size="25"
          fill="#777075"
        >
          pages read
        </text>

        <text
          x="770"
          y="555"
          font-family="Georgia, serif"
          font-size="70"
          fill="#d67f8f"
        >
          ${recapAverageRating}
        </text>

        <text
          x="770"
          y="605"
          font-family="Arial, sans-serif"
          font-size="25"
          fill="#777075"
        >
          avg rating
        </text>

        <text
          x="90"
          y="805"
          font-family="Arial, sans-serif"
          font-size="24"
          fill="#d47c8c"
          letter-spacing="3"
        >
          TOP READ
        </text>

        <text
          x="90"
          y="880"
          font-family="Georgia, serif"
          font-size="48"
          fill="#403a3e"
        >
          ${safeBook}
        </text>

        <text
          x="90"
          y="965"
          font-family="Arial, sans-serif"
          font-size="27"
          fill="#756e73"
        >
          ${highestRatedBook
            ? `${Number(
                highestRatedBook.rating
              ).toFixed(
                Number(
                  highestRatedBook.rating
                ) % 1 ===
                  0
                  ? 0
                  : 1
              )} / 5 stars`
            : 'Add ratings to reveal your top read'}
        </text>

        <text
          x="90"
          y="1085"
          font-family="Arial, sans-serif"
          font-size="25"
          fill="#8b8388"
        >
          Average pace: ${recapAverageDays || 0} days per finished book
        </text>

        <text
          x="90"
          y="1160"
          font-family="Arial, sans-serif"
          font-size="25"
          fill="#8b8388"
        >
          Best month: ${
            bestMonth?.count
              ? `${bestMonth.month} · ${bestMonth.count} books`
              : 'keep reading'
          }
        </text>

        <text
          x="90"
          y="1260"
          font-family="Arial, sans-serif"
          font-size="24"
          fill="#b26d7a"
        >
          pagelette.vercel.app
        </text>
      </svg>
    `

    const blob =
      new Blob(
        [svg],
        {
          type:
            'image/svg+xml;charset=utf-8',
        }
      )

    const url =
      URL.createObjectURL(
        blob
      )

    const image =
      new Image()

    image.onload =
      () => {
        const canvas =
          document.createElement(
            'canvas'
          )

        canvas.width =
          width

        canvas.height =
          height

        const context =
          canvas.getContext(
            '2d'
          )

        context.drawImage(
          image,
          0,
          0,
          width,
          height
        )

        URL.revokeObjectURL(
          url
        )

        const png =
          canvas.toDataURL(
            'image/png'
          )

        const link =
          document.createElement(
            'a'
          )

        link.href =
          png

        link.download =
          `pagelette-${recapYear}-reading-recap.png`

        document.body
          .appendChild(
            link
          )

        link.click()

        link.remove()
      }

    image.src = url
  }

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

      <section className="reading-recap-section">
        <div className="reading-recap-heading">
          <div>
            <p className="eyebrow">
              your year in books
            </p>

            <h2>
              Reading Recap
            </h2>

            <p>
              A shareable snapshot
              of what you read.
            </p>
          </div>

          <select
            value={
              recapYear
            }
            onChange={(
              event
            ) =>
              setRecapYear(
                Number(
                  event.target
                    .value
                )
              )
            }
          >
            {availableYears.map(
              (year) => (
                <option
                  value={
                    year
                  }
                  key={
                    year
                  }
                >
                  {year}
                </option>
              )
            )}
          </select>
        </div>

        <div className="reading-recap-layout">
          <article className="reading-recap-share-card">
            <div className="recap-card-orb recap-card-orb-one"></div>

            <div className="recap-card-orb recap-card-orb-two"></div>

            <div className="recap-card-top">
              <span>
                Pagelette
              </span>

              <small>
                {recapYear}
              </small>
            </div>

            <div className="recap-card-title">
              <p>
                {displayName}'s
              </p>

              <h3>
                reading recap
              </h3>
            </div>

            <div className="recap-card-number-grid">
              <div>
                <strong>
                  {
                    recapBooks.length
                  }
                </strong>

                <span>
                  books
                </span>
              </div>

              <div>
                <strong>
                  {recapPages.toLocaleString()}
                </strong>

                <span>
                  pages
                </span>
              </div>

              <div>
                <strong>
                  {
                    recapAverageRating
                  }
                </strong>

                <span>
                  avg rating
                </span>
              </div>
            </div>

            <div className="recap-card-feature">
              <span>
                top read
              </span>

              <strong>
                {highestRatedBook
                  ?.title ||
                  'Your next favorite is waiting'}
              </strong>

              {highestRatedBook && (
                <small>
                  {Number(
                    highestRatedBook.rating
                  ).toFixed(
                    Number(
                      highestRatedBook.rating
                    ) % 1 ===
                      0
                      ? 0
                      : 1
                  )}
                  ★
                </small>
              )}
            </div>

            <div className="recap-card-footer">
              <span>
                {recapAverageDays ||
                  0}{' '}
                avg days / book
              </span>

              <span>
                pagelette
              </span>
            </div>
          </article>

          <div className="reading-recap-details">
            <div className="recap-detail-grid">
              <div>
                <span>
                  Fastest Read
                </span>

                <strong>
                  {fastestRead
                    ? `${fastestRead.days} days`
                    : '—'}
                </strong>

                <small>
                  {fastestRead
                    ?.book
                    ?.title ||
                    'Add reading dates'}
                </small>
              </div>

              <div>
                <span>
                  Longest Read
                </span>

                <strong>
                  {longestRead
                    ? `${longestRead.days} days`
                    : '—'}
                </strong>

                <small>
                  {longestRead
                    ?.book
                    ?.title ||
                    'Add reading dates'}
                </small>
              </div>

              <div>
                <span>
                  Longest Book
                </span>

                <strong>
                  {longestBook
                    ? `${Number(
                        longestBook.totalPages ||
                          longestBook.pagesRead ||
                          0
                      ).toLocaleString()} pages`
                    : '—'}
                </strong>

                <small>
                  {longestBook
                    ?.title ||
                    'No finished books yet'}
                </small>
              </div>

              <div>
                <span>
                  Best Month
                </span>

                <strong>
                  {bestMonth?.count
                    ? bestMonth.month
                    : '—'}
                </strong>

                <small>
                  {bestMonth?.count
                    ? `${bestMonth.count} ${
                        bestMonth.count ===
                        1
                          ? 'book'
                          : 'books'
                      } finished`
                    : 'Keep reading'}
                </small>
              </div>
            </div>

            <div className="recap-actions">
              <button
                type="button"
                className="recap-download-button"
                onClick={
                  downloadRecap
                }
              >
                Download recap
              </button>

              <button
                type="button"
                className="recap-share-button"
                onClick={
                  shareRecap
                }
              >
                Share recap
              </button>
            </div>
          </div>
        </div>

        {recapFavorites.length >
          0 && (
          <div className="recap-favorites">
            <div>
              <p className="eyebrow">
                favorites from
                {` ${recapYear}`}
              </p>

              <h3>
                Books You Loved
              </h3>
            </div>

            <div className="recap-favorite-covers">
              {recapFavorites.map(
                (book) => (
                  <div
                    key={
                      book.key
                    }
                    title={
                      book.title
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
                      <div className="recap-favorite-empty">
                        <BookOpen
                          size={20}
                        />
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </section>

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

      if (currentUser) {
        await hydrateLibraryFromCloud(
          currentUser.id
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

            if (
              currentUser
            ) {
              setAuthLoading(
                true
              )

              void hydrateLibraryFromCloud(
                currentUser.id
              ).finally(() => {
                setUser(
                  currentUser
                )

                setAuthLoading(
                  false
                )
              })
            } else {
              setUser(null)

              setAuthLoading(
                false
              )
            }
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
            <MyBooksPage
              user={user}
            />
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
          path="/profile/:userId"
          element={
            <PublicProfilePage
              user={user}
            />
          }
        />

        <Route
          path="/profile"
          element={
            <ProfilePage
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
            <StatsPage
              user={user}
            />
          }
        />
      </Routes>
    </Layout>
  )
}

export default App