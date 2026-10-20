import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { PDF_COLORS as C } from "./colors";
import type { ReportPdfView } from "./view";

// La hoja del "Reporte (PDF)": tamaño carta, en el modo claro de la app. Página 1: el resumen, el gráfico
// y la tabla mes a mes; página 2: las categorías a la izquierda, y los gastos más grandes y los días de
// más gasto a la derecha. Los textos llegan armados (src/modules/reports/pdf/view.ts).
// La fuente es la de la app (Geist), registrada en render.tsx.

export const FONT = "Geist";

const TONES = { income: C.income, expense: C.expense, default: C.foreground } as const;

/** El alto del gráfico (sin los meses de abajo), en puntos. */
const CHART_HEIGHT = 120;
/** El margen de los lados y el ancho del contenido: el de la hoja carta (612 pt) sin los márgenes. */
const MARGIN = 40;
const CONTENT_WIDTH = 612 - 2 * MARGIN;
/** El espacio entre las tarjetas. */
const GAP = 8;

const s = StyleSheet.create({
  // Sin lineHeight en la hoja: heredado, deja los textos grandes encimados y el pie (fixed) sin dibujar.
  page: { fontFamily: FONT, fontSize: 8.5, color: C.foreground, paddingTop: 36, paddingBottom: 52, paddingHorizontal: MARGIN },
  muted: { color: C.muted },
  strong: { fontWeight: 600 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.brand },
  logo: { width: 24, height: 24, borderRadius: 5, backgroundColor: C.brand, color: "#ffffff", fontSize: 13, fontWeight: 600, textAlign: "center", paddingTop: 4 },
  title: { fontSize: 14, fontWeight: 600 },
  section: { marginTop: 16 },
  h2: { fontSize: 10.5, fontWeight: 600, marginBottom: 2 },
  intro: { color: C.muted, marginBottom: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  stat: { borderWidth: 0.75, borderColor: C.border, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 9, marginBottom: GAP },
  statValue: { fontSize: 12, fontWeight: 600, marginTop: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4, borderBottomWidth: 0.75, borderBottomColor: C.border },
  cell: { width: 110, textAlign: "right" },
  track: { height: 4, borderRadius: 2, backgroundColor: C.background, marginTop: 3 },
  bar: { height: 4, borderRadius: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: C.border,
    color: C.muted,
  },
});

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      {/* El título no queda solo al final de una hoja. */}
      <Text style={s.h2} minPresenceAhead={40}>
        {title}
      </Text>
      {intro && <Text style={s.intro}>{intro}</Text>}
      {children}
    </View>
  );
}

const Empty = ({ text }: { text: string }) => <Text style={[s.muted, { paddingVertical: 10 }]}>{text}</Text>;

function Header({ view }: { view: ReportPdfView }) {
  return (
    <View style={s.header}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={s.logo}>F</Text>
        <View style={{ marginLeft: 8 }}>
          <Text style={s.title}>Reporte de tus finanzas</Text>
          <Text style={s.muted}>{view.range}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 200 }}>
        <Text style={s.muted}>{view.name}</Text>
        <Text style={s.muted}>{view.generated}</Text>
      </View>
    </View>
  );
}

function Stats({ view }: { view: ReportPdfView }) {
  // Tres arriba y dos abajo (el mes de más gasto, a lo ancho de dos), como en un computador.
  const third = (CONTENT_WIDTH - 2 * GAP) / 3;
  const widths = [third, third, third, third, 2 * third + GAP];
  return (
    <View style={s.stats}>
      {view.stats.map((stat, i) => (
        <View key={stat.label} style={[s.stat, { width: widths[i], marginRight: i === 2 || i === 4 ? 0 : GAP }]} wrap={false}>
          <Text style={s.muted}>{stat.label}</Text>
          <Text style={[s.statValue, { color: TONES[stat.tone] }]}>{stat.value}</Text>
          {stat.note && <Text style={s.muted}>{stat.note}</Text>}
        </View>
      ))}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color, marginRight: 4 }} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

/** Dos barras por mes (ingresos en verde y egresos en naranja) sobre las marcas del eje. */
function Chart({ chart }: { chart: ReportPdfView["chart"] }) {
  const height = (amount: number) => (amount > 0 ? Math.max((amount / chart.max) * CHART_HEIGHT, 1) : 0);
  return (
    <View wrap={false}>
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        <Legend color={C.income} label="Ingresos" />
        <Legend color={C.expense} label="Egresos" />
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 44, height: CHART_HEIGHT, position: "relative" }}>
          {chart.ticks.map((tick) => (
            <Text key={tick.value} style={[s.muted, { position: "absolute", right: 6, top: CHART_HEIGHT - (tick.value / chart.max) * CHART_HEIGHT - 5, fontSize: 7.5 }]}>
              {tick.label}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ height: CHART_HEIGHT, position: "relative" }}>
            {chart.ticks.map((tick) => (
              <View
                key={tick.value}
                style={{ position: "absolute", left: 0, right: 0, top: CHART_HEIGHT - (tick.value / chart.max) * CHART_HEIGHT, borderTopWidth: 0.5, borderTopColor: C.border }}
              />
            ))}
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, flexDirection: "row", alignItems: "flex-end" }}>
              {chart.bars.map((bar, i) => (
                <View key={i} style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "flex-end" }}>
                  <View style={{ width: 9, height: height(bar.income), backgroundColor: C.income, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5, marginRight: 1.5 }} />
                  <View style={{ width: 9, height: height(bar.expense), backgroundColor: C.expense, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }} />
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", marginTop: 3 }}>
            {chart.bars.map((bar, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>{bar.short}</Text>
                {bar.year && <Text style={[s.muted, { fontSize: 7.5 }]}>{bar.year}</Text>}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function MonthTable({ months }: { months: ReportPdfView["months"] }) {
  return (
    <View>
      <View style={[s.row, s.muted]} wrap={false}>
        <Text style={{ flex: 1 }}>Mes</Text>
        <Text style={s.cell}>Ingresos</Text>
        <Text style={s.cell}>Egresos</Text>
        <Text style={s.cell}>Balance</Text>
      </View>
      {months.map((month) => (
        <View key={month.label} style={s.row} wrap={false}>
          <Text style={{ flex: 1 }}>
            {month.label}
            {month.inProgress && <Text style={s.muted}> (en curso)</Text>}
          </Text>
          <Text style={[s.cell, { color: C.income }]}>{month.income}</Text>
          <Text style={[s.cell, { color: C.expense }]}>{month.expense}</Text>
          <Text style={[s.cell, { color: month.negative ? C.expense : C.foreground }]}>{month.balance}</Text>
        </View>
      ))}
    </View>
  );
}

/** Una fila con su texto (y una línea de detalle debajo) a la izquierda y un monto a la derecha. */
function Line({ title, detail, amount, tone = C.foreground }: { title: string; detail?: string; amount: string; tone?: string }) {
  return (
    <View style={s.row} wrap={false}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text>{title}</Text>
        {detail && <Text style={s.muted}>{detail}</Text>}
      </View>
      <Text style={{ color: tone, fontWeight: 600 }}>{amount}</Text>
    </View>
  );
}

function Categories({ categories }: { categories: ReportPdfView["categories"] }) {
  return (
    <Section title="Gastos por categoría" intro={categories.intro}>
      {categories.empty ? (
        <Empty text={categories.empty} />
      ) : (
        categories.rows.map((row) => (
          <View key={row.name} style={s.row} wrap={false}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: row.color, marginRight: 5 }} />
                  <Text>{row.name}</Text>
                </View>
                <Text>
                  {row.amount}
                  <Text style={s.muted}> · {row.share}</Text>
                </Text>
              </View>
              <View style={s.track}>
                <View style={[s.bar, { width: `${Math.max(row.width * 100, 1)}%`, backgroundColor: row.color }]} />
              </View>
              {row.change && <Text style={[s.muted, { marginTop: 2 }]}>{row.change}</Text>}
            </View>
          </View>
        ))
      )}
    </Section>
  );
}

function Biggest({ biggest }: { biggest: ReportPdfView["biggest"] }) {
  return (
    <Section title="Los gastos más grandes" intro="Los egresos más altos del período, sin contar los gastos fijos.">
      {biggest.empty ? (
        <Empty text={biggest.empty} />
      ) : (
        biggest.rows.map((row, i) => <Line key={i} title={row.description} detail={row.detail} amount={row.amount} tone={C.expense} />)
      )}
    </Section>
  );
}

function Daily({ daily }: { daily: ReportPdfView["daily"] }) {
  return (
    <Section title="¿Qué días gastas más?" intro="El gasto promedio de cada día de la semana, sin los gastos fijos y contando los días sin gastos.">
      {daily.empty ? (
        <Empty text={daily.empty} />
      ) : (
        <View wrap={false}>
          {daily.weekdays.map((day) => (
            <View key={day.label} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2 }}>
              <Text style={[s.muted, { width: 50 }]}>{day.label}</Text>
              <View style={[s.track, { flex: 1, marginTop: 0, height: 6 }]}>
                <View style={[s.bar, { height: 6, width: `${day.width * 100}%`, backgroundColor: C.brand }]} />
              </View>
              <Text style={{ width: 82, textAlign: "right" }}>{day.amount}</Text>
            </View>
          ))}
          {daily.insight && <Text style={[s.muted, { marginTop: 4 }]}>{daily.insight}</Text>}
          <View style={{ flexDirection: "row", marginTop: 8, marginHorizontal: -3 }}>
            {daily.halves.map((half) => (
              <View key={half.label} style={[s.stat, { flex: 1, marginHorizontal: 3 }]}>
                <Text style={s.muted}>{half.label}</Text>
                <Text style={[s.strong, { fontSize: 10 }]}>{half.amount}</Text>
                <Text style={s.muted}>{half.share}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Section>
  );
}

export function ReportDocument({ view }: { view: ReportPdfView }) {
  return (
    <Document title={`Reporte de tus finanzas · ${view.range}`} author={view.name} creator="Finanzas" producer="Finanzas" language="es-CO">
      <Page size="LETTER" style={s.page}>
        <Header view={view} />
        {view.empty ? (
          <Empty text={view.empty} />
        ) : (
          <>
            <Stats view={view} />
            <Section title="Ingresos y egresos por mes">
              <Chart chart={view.chart} />
            </Section>
            <Section title="Mes a mes">
              <MonthTable months={view.months} />
            </Section>

            <View break style={[s.row, s.muted, { paddingTop: 0, paddingBottom: 8 }]}>
              <Text>Reporte de tus finanzas · {view.range}</Text>
              <Text>{view.name}</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 11 }}>
                <Categories categories={view.categories} />
              </View>
              <View style={{ flex: 1, marginLeft: 11 }}>
                <Biggest biggest={view.biggest} />
                <Daily daily={view.daily} />
              </View>
            </View>
          </>
        )}
        {/* El pie, en cada hoja. */}
        <View style={s.footer} fixed>
          <Text>Finanzas · {view.currency}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
