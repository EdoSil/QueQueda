namespace QueQueda.Client.Models;

public class MensajeChat
{
    public string Texto { get; set; } = "";
    public bool EsUsuario { get; set; }
    public string Tipo { get; set; } = "texto";
    public string Titulo { get; set; } = "";
    public string Pie { get; set; } = "";
    public List<DetalleMensaje> Elementos { get; set; } = new();

    // Producto pendiente de confirmación para agregar al inventario.
    public string ProductoPendiente { get; set; } = "";
}

public class DetalleMensaje
{
    public string Nombre { get; set; } = "";
    public decimal Cantidad { get; set; }
    public string Unidad { get; set; } = "";
    public string Icono { get; set; } = "📦";
}