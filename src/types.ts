export interface CalendarEvent {
  id: string;
  originalId?: string;
  // Set by the server on every CalendarEvent/get result. For an occurrence
  // handed out by CalendarEvent/query?expandRecurrences=true (a "synthetic"
  // id) this is the id of the stored base event; for a base event it equals
  // `id`. See lib/recurrence-instances.ts.
  baseEventId?: string | null;
  calendarIds: Record<string, boolean>;
  originalCalendarIds?: Record<string, boolean>;
  accountId?: string;
  accountName?: string;
  isShared?: boolean;
  // See `Calendar.localAccountId` - same purpose for events.
  localAccountId?: string;
  isDraft: boolean;
  isOrigin: boolean;
  utcStart: string | null;// ENCRYPTED
  utcEnd: string | null;// ENCRYPTED
  '@type': 'Event';
  uid: string;
  title: string; // REPLACED BY DATE MONTH ENCRYPTED
  description: string; // REPLACED BY THE CONTENT ENCRYPTED
  descriptionContentType: string;
  created: string | null;
  updated: string;
  sequence: number;
  start: string;// ENCRYPTED to descruption and replaced by 01/01/1970 00:00:00
  duration: string;// ENCRYPTED to descruption and replaced by 1 hour
  timeZone: string | null; //ENCRYPTED to descruption and replaced by 1 hour
  showWithoutTime: boolean;
  status: 'tentative' | 'confirmed' | 'cancelled';
  freeBusyStatus: 'free' | 'busy';
  privacy: 'public' | 'private' | 'secret';
  color: string | null;
  keywords: Record<string, boolean> | null;//ENCRYPTED to descruption and removed
  categories: Record<string, boolean> | null;//ENCRYPTED to descruption and removed
  locale: string | null;
  replyTo: Record<string, string> | null;//ENCRYPTED to descruption and removed
  organizerCalendarAddress: string | null;//ENCRYPTED to descruption and removed
  participants: Record<string, CalendarParticipant> | null;//ENCRYPTED to descruption and removed
  mayInviteSelf: boolean;
  mayInviteOthers: boolean;
  hideAttendees: boolean;
  recurrenceId: string | null;//NOT ENCRYPTED FOR NOW
  recurrenceIdTimeZone: string | null;//NOT ENCRYPTED FOR NOW
  recurrenceRules: CalendarRecurrenceRule[] | null;//NOT ENCRYPTED FOR NOW
  recurrenceOverrides: Record<string, Partial<CalendarEvent>> | null;//NOT ENCRYPTED FOR NOW
  excludedRecurrenceRules: CalendarRecurrenceRule[] | null;//NOT ENCRYPTED FOR NOW
  useDefaultAlerts: boolean;
  alerts: Record<string, CalendarEventAlert> | null;
  locations: Record<string, CalendarLocation> | null;//ENCRYPTED to descruption and removed
  virtualLocations: Record<string, CalendarVirtualLocation> | null;//ENCRYPTED to descruption and removed
  links: Record<string, CalendarLink> | null;//ENCRYPTED to descruption and removed
  relatedTo: Record<string, CalendarRelation> | null;//ENCRYPTED to descruption and removed
}
// For recurrences, in future, we will genreate ourslef the events, in this way, no need to store recurrence rules. Howerver we will lose the abaility to edit all occurence at same time.
export interface CalendarParticipant {
  '@type': 'Participant';
  name: string;
  email: string;
  calendarAddress: string | null;
  description: string | null;
  sendTo: Record<string, string> | null;
  kind: 'individual' | 'group' | 'location' | 'resource';
  roles: Record<string, boolean>;
  participationStatus: 'accepted' | 'declined' | 'tentative' | 'delegated' | 'needs-action';
  participationComment: string | null;
  expectReply: boolean;
  scheduleAgent: 'server' | 'client' | 'none';
  scheduleForceSend: boolean;
  scheduleId: string | null;
  scheduleSequence: number;
  scheduleStatus: string[] | null;
  scheduleUpdated: string | null;
  invitedBy: string | null;
  delegatedTo: Record<string, boolean> | null;
  delegatedFrom: Record<string, boolean> | null;
  memberOf: Record<string, boolean> | null;
  locationId: string | null;
  language: string | null;
  links: Record<string, CalendarLink> | null;
}

export interface CalendarRecurrenceRule {
  '@type': 'RecurrenceRule';
  frequency: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly' | 'minutely' | 'secondly';
  interval: number;
  // Optional and normally omitted: these RFC 7529 (RSCALE/SKIP) fields only
  // apply to non-Gregorian scales / invalid-date handling. Emitting a default
  // SKIP=OMIT breaks some CalDAV clients (DAVx5) - see lib/recurrence-rule.ts (#805).
  rscale?: string;
  skip?: 'omit' | 'backward' | 'forward';
  firstDayOfWeek: 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';
  byDay: CalendarNDay[] | null;
  byMonthDay: number[] | null;
  byMonth: string[] | null;
  byYearDay: number[] | null;
  byWeekNo: number[] | null;
  byHour: number[] | null;
  byMinute: number[] | null;
  bySecond: number[] | null;
  bySetPosition: number[] | null;
  count: number | null;
  until: string | null;
}

export interface CalendarEventAlert {
  '@type': 'Alert';
  trigger: CalendarOffsetTrigger | CalendarAbsoluteTrigger;
  action: 'display' | 'email';
  acknowledged: string | null;
  relatedTo: Record<string, CalendarRelation> | null;
}

export interface CalendarNDay {
  day: string;
  nthOfPeriod?: number;
}

export interface CalendarOffsetTrigger {
  '@type': 'OffsetTrigger';
  offset: string;
  relativeTo: 'start' | 'end';
}

export interface CalendarAbsoluteTrigger {
  '@type': 'AbsoluteTrigger';
  when: string;
}

export interface CalendarLocation {
  '@type': 'Location';
  name: string;
  description: string | null;
  locationTypes: Record<string, boolean> | null;
  coordinates: string | null;
  timeZone: string | null;
  links: Record<string, CalendarLink> | null;
  relativeTo: 'start' | 'end' | null;
}

export interface CalendarVirtualLocation {
  '@type': 'VirtualLocation';
  name: string | null;
  description: string | null;
  uri: string;
  features: Record<string, boolean> | null;
}

export interface CalendarLink {
  '@type': 'Link';
  href: string;
  cid: string | null;
  contentType: string | null;
  size: number | null;
  rel: string | null;
  display: string | null;
  title: string | null;
}

export interface CalendarRelation {
  '@type': 'Relation';
  relation: Record<string, boolean> | null;
}


export interface CalendarEventFilter {
  inCalendars?: string[];
  after?: string;
  before?: string;
  text?: string;
  title?: string;
  description?: string;
  location?: string;
  owner?: string;
  attendee?: string;
  participationStatus?: string;
  uid?: string;
  types?: string[];
}
//-----------Crypto

export interface SessionKeysEntry {
  id: string; 
  accountId: string;
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
}


export interface AccountEntry {
  id: string;/** Unique key: `${username}@${serverHostname}` */
  label: string;
  serverUrl: string;
  username: string;
  displayName: string;
  email: string;
  avatarColor: string;
  isConnected: boolean;
  isDefault: boolean;
  isActive: boolean;
}

// Only used to create events with the api.calendar.createEvent()
export interface CalendarEventInput {
  /** 1-500 characters. */
  title: string;
  /** Up to 10,000 characters of plain text. */
  description?: string;
  start: string;
  /** Exclusive: an all-day event on May 1 ends on `2026-05-02`. */
  end?: string;
  /** ISO 8601 duration such as `PT1H30M`, or whole days (`P2D`) when all-day. */
  duration?: string;
  /** IANA zone of a wall-clock `start`. Defaults to the user's zone. */
  timeZone?: string;
  /** Defaults to true when `start` is a date without a time. */
  isAllDay?: boolean;
  /** Up to 500 characters. */
  location?: string;
  /** From `api.calendar.listCalendars()`. Defaults to the default calendar. */
  calendarId?: string;
  /**
   * Attendees, at most 50, stored with the user as organizer. No invitation
   * is sent; the user can send them from the event. An empty array removes
   * them.
   */
  participants?: { email: string; name?: string }[];
  /**
   * Repeat the event. `until` is a date (YYYY-MM-DD); give `count` or
   * `until`, not both. null removes the repetition (updates).
   */
  repeat?: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; count?: number; until?: string } | null;
  /**
   * createEvent only: your own stable id for the event, 1-128 of
   * `A-Z a-z 0-9 . _ : -`. It is stored as `<uid>@<pluginId>.plugin.bulwark`,
   * which is what CalendarEventView.uid then shows, so you can find the
   * event again without remembering its id.
   */
  uid?: string;
}